import { SubstrateEvent } from '@subql/types'
import { errorHandler } from '../../helpers/errorHandler'
import { EpochService } from '../services/epochService'
import { PoolService } from '../services/poolService'
import { TrancheService } from '../services/trancheService'
import { EpochEvent, OrderEvent, OrdersCollectedEvent, PoolCreatedUpdatedEvent } from '../../helpers/types'
import { OutstandingOrderService } from '../services/outstandingOrderService'
import { InvestorTransactionData, InvestorTransactionService } from '../services/investorTransactionService'
import { CurrencyService } from '../services/currencyService'
import { AccountService } from '../services/accountService'
import { TrancheBalanceService } from '../services/trancheBalanceService'

export const handlePoolCreated = errorHandler(_handlePoolCreated)
async function _handlePoolCreated(event: SubstrateEvent<PoolCreatedUpdatedEvent>): Promise<void> {
  const [poolId] = event.event.data
  logger.info(`Pool ${poolId.toString()} created in block ${event.block.block.header.number}`)

  // Initialise Pool
  const poolService = await PoolService.init(
    poolId.toString(),
    event.block.timestamp,
    event.block.block.header.number.toNumber()
  )
  await poolService.initData(async (ticker) => (await CurrencyService.getOrInit(ticker)).id)
  await poolService.save()

  // Initialise the tranches
  const tranches = await poolService.getTranches()
  for (const [id, tranche] of Object.entries(tranches)) {
    logger.info(`Creating tranche with id: ${id}`)
    const trancheService = await TrancheService.init(poolId.toString(), id, tranche.index, tranche.data)
    await trancheService.updateSupply()
    await trancheService.updateDebt(tranche.data.debt.toBigInt())
    await trancheService.save()
  }

  // Initialise Epoch
  const epochService = await EpochService.init(
    poolId.toString(),
    poolService.currentEpoch,
    Object.keys(tranches),
    event.block.timestamp
  )
  await epochService.save()
}

export const handlePoolUpdated = errorHandler(_handlePoolUpdated)
async function _handlePoolUpdated(event: SubstrateEvent<PoolCreatedUpdatedEvent>): Promise<void> {
  const [poolId] = event.event.data
  const pool = await PoolService.getById(poolId.toString())
  logger.info(`Pool ${poolId.toString()} updated on block ${event.block.block.header.number}`)
  await pool.initData(async (ticker) => (await CurrencyService.getOrInit(ticker)).id)
  await pool.save()

  // Deactivate active tranches
  const activeTranches = await TrancheService.getActives(poolId.toString())
  for (const activeTranche of activeTranches) {
    await activeTranche.deactivate()
    await activeTranche.save()
  }

  // Reprocess tranches
  const tranches = await pool.getTranches()
  for (const [id, tranche] of Object.entries(tranches)) {
    logger.info(`Syncing tranche with id: ${id}`)
    const trancheService = await TrancheService.getOrInit(poolId.toString(), id, tranche.index, tranche.data)
    await trancheService.activate()
    await trancheService.updateSupply()
    await trancheService.updateDebt(tranche.data.debt.toBigInt())
    await trancheService.save()
  }
}

export const handleEpochClosed = errorHandler(_handleEpochClosed)
async function _handleEpochClosed(event: SubstrateEvent<EpochEvent>): Promise<void> {
  const [poolId, epochId] = event.event.data
  logger.info(
    `Epoch ${epochId.toNumber()} closed for pool ${poolId.toString()} in block ${event.block.block.header.number}`
  )
  // Close the current epoch and open a new one
  const tranches = await TrancheService.getByPoolId(poolId.toString())
  const epoch = await EpochService.getById(poolId.toString(), epochId.toNumber())
  await epoch.closeEpoch(event.block.timestamp)
  await epoch.save()

  const trancheIds = tranches.map((tranche) => tranche.trancheId)
  const epochNext = await EpochService.init(
    poolId.toString(),
    epochId.toNumber() + 1,
    trancheIds,
    event.block.timestamp
  )
  await epochNext.save()

  const pool = await PoolService.getById(poolId.toString())
  await pool.closeEpoch(epochId.toNumber())
  await pool.save()
}

export const handleEpochExecuted = errorHandler(_handleEpochExecuted)
async function _handleEpochExecuted(event: SubstrateEvent<EpochEvent>): Promise<void> {
  const [poolId, epochId] = event.event.data
  logger.info(
    `Epoch ${epochId.toString()} executed event for pool ${poolId.toString()} ` +
      `at block ${event.block.block.header.number.toString()}`
  )

  const poolService = await PoolService.getById(poolId.toString())
  const epoch = await EpochService.getById(poolId.toString(), epochId.toNumber())
  const digits = ((await CurrencyService.get(poolService.currencyId)) as CurrencyService).decimals

  await epoch.executeEpoch(event.block.timestamp, digits)
  await epoch.save()

  await poolService.executeEpoch(epochId.toNumber())
  await poolService.increaseTotalInvested(epoch.totalInvested)
  await poolService.increaseTotalRedeemed(epoch.totalRedeemed)
  await poolService.save()

  // Compute and save aggregated order fulfillment
  const tranches = await TrancheService.getByPoolId(poolId.toString())
  const nextEpoch = await EpochService.getById(poolId.toString(), epochId.toNumber() + 1)
  for (const tranche of tranches) {
    const epochState = epoch.states.find((epochState) => epochState.trancheId === tranche.trancheId)
    await tranche.updateSupply()
    await tranche.updatePrice(epochState.price)
    await tranche.updateFulfilledInvestOrders(epochState.fulfilledInvestOrders)
    await tranche.updateFulfilledRedeemOrders(epochState.fulfilledRedeemOrders, digits)
    await tranche.save()

    // Carry over aggregated unfulfilled orders to next epoch
    await nextEpoch.updateOutstandingInvestOrders(
      tranche.trancheId,
      epochState.outstandingInvestOrders - epochState.fulfilledInvestOrders,
      BigInt(0)
    )
    await nextEpoch.updateOutstandingRedeemOrders(
      tranche.trancheId,
      epochState.outstandingRedeemOrders - epochState.fulfilledRedeemOrders,
      BigInt(0),
      epochState.price,
      digits
    )

    // Find single outstanding orders posted for this tranche and fulfill them to investorTransactions
    const oos = await OutstandingOrderService.getAllByTrancheId(poolId.toString(), tranche.trancheId)
    logger.info(`Fulfilling ${oos.length} outstanding orders for tranche ${tranche.trancheId}`)
    for (const oo of oos) {
      logger.info(`Outstanding invest before fulfillment: ${oo.invest} redeem:${oo.redeem}`)
      const orderData = {
        poolId: poolId.toString(),
        trancheId: tranche.trancheId,
        epochNumber: epochId.toNumber(),
        address: oo.accountId,
        hash: oo.hash,
        digits: ((await CurrencyService.get(poolService.currencyId)) as CurrencyService).decimals,
        price: epochState.price,
        fee: BigInt(0),
        timestamp: event.block.timestamp,
      }

      const trancheBalance = await TrancheBalanceService.getOrInit(
        orderData.address,
        orderData.poolId,
        orderData.trancheId
      )

      if (oo.invest > BigInt(0) && epochState.investFulfillment > BigInt(0)) {
        const it = InvestorTransactionService.executeInvestOrder({
          ...orderData,
          amount: oo.invest,
          fulfillmentRate: epochState.investFulfillment,
        })
        await it.save()
        await oo.updateUnfulfilledInvest(it.currencyAmount)
        await trancheBalance.investExecute(it.currencyAmount, it.tokenAmount)
      }

      if (oo.redeem > BigInt(0) && epochState.redeemFulfillment > BigInt(0)) {
        const it = InvestorTransactionService.executeRedeemOrder({
          ...orderData,
          amount: oo.redeem,
          fulfillmentRate: epochState.redeemFulfillment,
        })
        await it.save()
        await oo.updateUnfulfilledRedeem(it.tokenAmount)
        await trancheBalance.redeemExecute(it.tokenAmount, it.currencyAmount)
      }

      await trancheBalance.save()

      // Remove outstandingOrder if completely fulfilled
      if (oo.invest > BigInt(0) || oo.redeem > BigInt(0)) {
        await oo.save()
      } else {
        await OutstandingOrderService.remove(oo.id)
      }
      logger.info(`Outstanding invest after fulfillment: ${oo.invest} redeem:${oo.redeem}`)
    }
  }
  await nextEpoch.save()
}

export const handleInvestOrderUpdated = errorHandler(_handleInvestOrderUpdated)
async function _handleInvestOrderUpdated(event: SubstrateEvent<OrderEvent>): Promise<void> {
  const [poolId, trancheId, address, oldAmount, newAmount] = event.event.data
  logger.info(
    `Invest order updated for tranche ${poolId.toString()}-${trancheId.toString()}. ` +
      `New: ${newAmount.toString()} Old: ${oldAmount.toString()} at ` +
      `block ${event.block.block.header.number.toString()}`
  )

  const pool = await PoolService.getById(poolId.toString())
  const account = await AccountService.getOrInit(address.toString())
  const tranche = await TrancheService.getById(poolId.toString(), trancheId.toHex())

  // Update tranche price
  await tranche.updatePriceFromRpc()

  const orderData: InvestorTransactionData = {
    poolId: poolId.toString(),
    trancheId: trancheId.toString(),
    epochNumber: pool.currentEpoch,
    address: account.id,
    hash: event.extrinsic.extrinsic.hash.toString(),
    amount: newAmount.toBigInt(),
    digits: ((await CurrencyService.get(pool.currencyId)) as CurrencyService).decimals,
    price: tranche.price,
    fee: BigInt(0),
    timestamp: event.block.timestamp,
  }

  if (newAmount.toBigInt() > BigInt(0)) {
    // Post investor transaction
    const it = InvestorTransactionService.updateInvestOrder(orderData)
    await it.save()
  } else {
    // Cancel transaction
    const it = InvestorTransactionService.cancelInvestOrder(orderData)
    await it.save()
  }

  // Initialise or update outstanding transaction
  const oo = OutstandingOrderService.initInvest(orderData)
  await oo.save()

  // Update tranche outstanding total
  await tranche.updateOutstandingInvestOrders(newAmount.toBigInt(), oldAmount.toBigInt())
  await tranche.save()

  // Update epochState outstanding total
  const epoch = await EpochService.getById(poolId.toString(), pool.currentEpoch)
  await epoch.updateOutstandingInvestOrders(trancheId.toHex(), newAmount.toBigInt(), oldAmount.toBigInt())
  await epoch.save()

  // Update trancheBalance
  const trancheBalance = await TrancheBalanceService.getOrInit(orderData.address, orderData.poolId, orderData.trancheId)
  await trancheBalance.investOrder(orderData.amount)
  await trancheBalance.save()
}

export const handleRedeemOrderUpdated = errorHandler(_handleRedeemOrderUpdated)
async function _handleRedeemOrderUpdated(event: SubstrateEvent<OrderEvent>): Promise<void> {
  const [poolId, trancheId, address, oldAmount, newAmount] = event.event.data
  logger.info(
    `Redeem order updated for tranche ${poolId.toString()}-${trancheId.toString()}. ` +
      `New: ${newAmount.toString()} Old: ${oldAmount.toString()} at ` +
      `block ${event.block.block.header.number.toString()}`
  )
  // Get corresponding pool
  const pool = await PoolService.getById(poolId.toString())
  const account = await AccountService.getOrInit(address.toString())
  const tranche = await TrancheService.getById(poolId.toString(), trancheId.toHex())
  const digits = ((await CurrencyService.get(pool.currencyId)) as CurrencyService).decimals

  await tranche.updatePriceFromRpc()

  const orderData: InvestorTransactionData = {
    poolId: poolId.toString(),
    trancheId: trancheId.toString(),
    epochNumber: pool.currentEpoch,
    address: account.id,
    hash: event.extrinsic.extrinsic.hash.toString(),
    amount: newAmount.toBigInt(),
    digits: digits,
    price: tranche.price,
    fee: BigInt(0),
    timestamp: event.block.timestamp,
  }

  if (newAmount.toBigInt() > BigInt(0)) {
    // Post investor transaction
    const it = InvestorTransactionService.updateRedeemOrder(orderData)
    await it.save()
  } else {
    // Cancel transaction
    const it = InvestorTransactionService.cancelRedeemOrder(orderData)
    await it.save()
  }

  // Initialise outstanding transaction
  const oo = OutstandingOrderService.initInvest(orderData)
  await oo.save()

  // Update tranche outstanding total
  await tranche.updateOutstandingRedeemOrders(newAmount.toBigInt(), oldAmount.toBigInt(), digits)
  await tranche.save()

  // Update epochState outstanding total
  const epoch = await EpochService.getById(poolId.toString(), pool.currentEpoch)
  await epoch.updateOutstandingRedeemOrders(
    trancheId.toHex(),
    newAmount.toBigInt(),
    oldAmount.toBigInt(),
    tranche.price,
    digits
  )
  await epoch.save()

  // Update trancheBalance
  const trancheBalance = await TrancheBalanceService.getOrInit(orderData.address, orderData.poolId, orderData.trancheId)
  await trancheBalance.redeemOrder(orderData.amount)
  await trancheBalance.save()
}

export const handleOrdersCollected = errorHandler(_handleOrdersCollected)
async function _handleOrdersCollected(event: SubstrateEvent<OrdersCollectedEvent>): Promise<void> {
  const [poolId, trancheId, endEpochId, address, outstandingCollections] = event.event.data
  logger.info(
    `Orders collected for tranche ${poolId.toString()}-${trancheId.toString()}. ` +
      `Address: ${address.toString()} endEpoch: ${endEpochId.toNumber()} at ` +
      `block ${event.block.block.header.number.toString()} hash:${event.extrinsic.extrinsic.hash.toString()}`
  )

  const pool = await PoolService.getById(poolId.toString())
  const account = await AccountService.getOrInit(address.toString())
  const tranche = await TrancheService.getById(poolId.toString(), trancheId.toHex())

  // Update tranche price
  await tranche.updatePriceFromRpc()
  await tranche.save()

  const { payoutTokenAmount, payoutCurrencyAmount } = outstandingCollections

  const orderData = {
    poolId: poolId.toString(),
    trancheId: trancheId.toString(),
    epochNumber: endEpochId.toNumber(),
    address: account.id,
    hash: event.extrinsic.extrinsic.hash.toString(),
    timestamp: event.block.timestamp,
    digits: ((await CurrencyService.get(pool.currencyId)) as CurrencyService).decimals,
    price: tranche.price,
  }

  const trancheBalance = await TrancheBalanceService.getOrInit(orderData.address, orderData.poolId, orderData.trancheId)

  if (payoutTokenAmount.toBigInt() > 0) {
    const it = InvestorTransactionService.collectInvestOrder({ ...orderData, amount: payoutTokenAmount.toBigInt() })
    await it.save()
    await trancheBalance.investCollect(payoutTokenAmount.toBigInt())
  }

  if (payoutCurrencyAmount.toBigInt() > 0) {
    const it = InvestorTransactionService.collectRedeemOrder({ ...orderData, amount: payoutCurrencyAmount.toBigInt() })
    await it.save()
    await trancheBalance.redeemCollect(payoutCurrencyAmount.toBigInt())
  }
  await trancheBalance.save()
}
