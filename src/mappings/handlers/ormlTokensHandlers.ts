import { SubstrateEvent } from '@subql/types'
import { errorHandler, missingPool } from '../../helpers/errorHandler'
import { TokensCurrencyId, TokensEndowedDepositedWithdrawnEvent, TokensTransferEvent } from '../../helpers/types'
import { AccountService } from '../services/accountService'
import { CurrencyBalanceService } from '../services/currencyBalanceService'
import { CurrencyService } from '../services/currencyService'
import { InvestorTransactionService } from '../services/investorTransactionService'
import { PoolService } from '../services/poolService'
import { TrancheService } from '../services/trancheService'
import { BlockchainService } from '../services/blockchainService'

export const handleTokenTransfer = errorHandler(_handleTokenTransfer)
async function _handleTokenTransfer(event: SubstrateEvent<TokensTransferEvent>): Promise<void> {
  const [_currency, from, to, amount] = event.event.data

  // Skip token transfers from and to excluded addresses
  const fromAddress = String.fromCharCode(...from.toU8a())
  const toAddress = String.fromCharCode(...to.toU8a())
  const isFromExcludedAddress = fromAddress.startsWith('pool')
  const isToExcludedAddress = toAddress.startsWith('pool')

  const [fromAccount, toAccount] = await Promise.all([
    AccountService.getOrInit(from.toHex()),
    AccountService.getOrInit(to.toHex()),
  ])

  const pool = _currency.isTranche ? await PoolService.getById(_currency.asTranche[0].toString()) : null
  if (pool === undefined) throw missingPool

  const tranche = _currency.isTranche ? await TrancheService.getById(pool.id, _currency.asTranche[1].toString()) : null
  if (tranche === undefined) throw new Error('Tranche not found!')

  const blockchain = await BlockchainService.getOrInit()
  const currency = await CurrencyService.getOrInit(
    blockchain.id,
    _currency.type,
    ...currencyFormatters[_currency.type](_currency.value)
  )

  // TRANCHE TOKEN TRANSFERS BETWEEN INVESTORS
  if (_currency.isTranche && !isFromExcludedAddress && !isToExcludedAddress) {
    logger.info(
      `Tranche Token transfer between investors tor tranche: ${pool.id}-${tranche.trancheId}. ` +
        `from: ${from.toHex()} to: ${to.toHex()} amount: ${amount.toString()} ` +
        `at block ${event.block.block.header.number.toString()}`
    )

    // Update tranche price
    await tranche.updatePriceFromRpc(event.block.block.header.number.toNumber())
    await tranche.save()

    const orderData = {
      poolId: pool.id,
      trancheId: tranche.trancheId,
      epochNumber: pool.currentEpoch,
      hash: event.extrinsic.extrinsic.hash.toString(),
      timestamp: event.block.timestamp,
      price: tranche.tokenPrice,
      amount: amount.toBigInt(),
    }

    // CREATE 2 TRANSFERS FOR FROM AND TO ADDRESS
    // with from create TRANSFER_OUT
    const txOut = InvestorTransactionService.transferOut({ ...orderData, address: fromAccount.id })
    await txOut.save()

    // with to create TRANSFER_IN
    const txIn = InvestorTransactionService.transferIn({ ...orderData, address: toAccount.id })
    await txIn.save()
  }

  // TRACK CURRENCY TOKEN TRANSFER
  logger.info(
    `Currency transfer ${currency.id} from: ${from.toHex()} to: ${to.toHex()} amount: ${amount.toString()} ` +
      `at block ${event.block.block.header.number.toString()}`
  )

  if (!fromAddress.startsWith('pool')) {
    const fromAccount = await AccountService.getOrInit(from.toHex())
    const fromCurrencyBalance = await CurrencyBalanceService.getOrInit(fromAccount.id, currency.id)
    await fromCurrencyBalance.debit(amount.toBigInt())
    await fromCurrencyBalance.save()
  }

  if (!toAddress.startsWith('pool')) {
    const toAccount = await AccountService.getOrInit(to.toHex())
    const toCurrencyBalance = await CurrencyBalanceService.getOrInit(toAccount.id, currency.id)
    await toCurrencyBalance.credit(amount.toBigInt())
    await toCurrencyBalance.save()
  }
}

export const handleTokenEndowed = errorHandler(_handleTokenEndowed)
async function _handleTokenEndowed(event: SubstrateEvent<TokensEndowedDepositedWithdrawnEvent>): Promise<void> {
  const [currency, address, amount] = event.event.data
  if (currency.isTranche) return
  logger.info(
    `Currency endowment in ${currency.toString()} for: ${address.toHex()} amount: ${amount.toString()} ` +
      `at block ${event.block.block.header.number.toString()}`
  )
  const currencyTicker = currency.type
  const currencyId = currency.value.toString()
  const currencyService = await CurrencyService.getOrInit(currencyTicker, currencyId)
  const toAccount = await AccountService.getOrInit(address.toHex())
  const toCurrencyBalance = await CurrencyBalanceService.getOrInit(toAccount.id, currencyService.id)
  await toCurrencyBalance.credit(amount.toBigInt())
  await toCurrencyBalance.save()
}

export const handleTokenDeposited = errorHandler(_handleTokenDeposited)
async function _handleTokenDeposited(event: SubstrateEvent<TokensEndowedDepositedWithdrawnEvent>): Promise<void> {
  const [currency, address, amount] = event.event.data
  if (currency.isTranche) return
  logger.info(
    `Currency deposit in ${currency.toString()} for: ${address.toHex()} amount: ${amount.toString()} ` +
      `at block ${event.block.block.header.number.toString()}`
  )
  const currencyTicker = currency.type
  const currencyId = currency.value.toString()
  const currencyService = await CurrencyService.getOrInit(currencyTicker, currencyId)
  const toAccount = await AccountService.getOrInit(address.toHex())
  const toCurrencyBalance = await CurrencyBalanceService.getOrInit(toAccount.id, currencyService.id)
  await toCurrencyBalance.credit(amount.toBigInt())
  await toCurrencyBalance.save()
}

export const handleTokenWithdrawn = errorHandler(_handleTokenWithdrawn)
async function _handleTokenWithdrawn(event: SubstrateEvent<TokensEndowedDepositedWithdrawnEvent>): Promise<void> {
  const [currency, address, amount] = event.event.data
  if (currency.isTranche) return
  logger.info(
    `Currency withdrawal in ${currency.toString()} for: ${address.toHex()} amount: ${amount.toString()} ` +
      `at block ${event.block.block.header.number.toString()}`
  )
  const currencyTicker = currency.type
  const currencyId = currency.value.toString()
  const currencyService = await CurrencyService.getOrInit(currencyTicker, currencyId)
  const toAccount = await AccountService.getOrInit(address.toHex())
  const toCurrencyBalance = await CurrencyBalanceService.getOrInit(toAccount.id, currencyService.id)
  await toCurrencyBalance.debit(amount.toBigInt())
  await toCurrencyBalance.save()
}

const currencyFormatters: CurrencyFormatters = {
  AUSD: () => [],
  ForeignAsset: (value) => [value.toString(10)],
  Native: () => [],
  Staking: () => ['BlockRewards'],
  Tranche: (value) => [value[0].toString(10), value[1].toHex()],
}

type CurrencyFormatters = {
  [K in keyof TokensCurrencyId as K extends `as${infer R}` ? R : never]: (value: TokensCurrencyId[K]) => string[]
}
