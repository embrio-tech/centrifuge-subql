import { SubstrateEvent, SubstrateBlock } from '@subql/types'
import { EpochEvent } from '../helpers/types'
import { errorHandler } from '../helpers/errorHandler'
import { Tranche } from '../types'
import { PoolService } from './services/poolsService'
import { TrancheService } from './services/trancheService'
import { EpochService } from './services/epochService'

export const handleEpochClosed = errorHandler(_handleEpochClosed)
async function _handleEpochClosed(event: SubstrateEvent): Promise<void> {
  logger.info(`Epoch closed in block ${event.block.block.header.number}: ${event.toString()}`)

  // Close the current epoch and open a new one
  const [poolId, epochId] = event.event.data as unknown as EpochEvent
  const epochService = new EpochService()
  await epochService.getById(`${poolId.toString()}-${epochId.toString()}`)
  await epochService.closeEpoch(event.block.timestamp)
  await epochService.save()

  const epochServiceNext = new EpochService()
  await epochServiceNext.init(poolId.toString(), epochId.toNumber(), event.block.timestamp)

  const poolService = await PoolService.getById(poolId.toString())
  await poolService.closeEpoch(epochId.toNumber())
  await poolService.save()
}

export const handleEpochExecuted = errorHandler(_handleEpochExecuted)
async function _handleEpochExecuted(event: SubstrateEvent): Promise<void> {
  const [poolId, epochId] = event.event.data as unknown as EpochEvent
  logger.info(
    `Epoch ${epochId.toString()} executed for pool ${poolId.toString()} at block ${event.block.block.header.number.toString()}`
  )

  const epochService = new EpochService()
  await epochService.getById(`${poolId.toString()}-${epochId.toString()}`)
  await epochService.executeEpoch(event.block.timestamp)
  await epochService.save()

  const tranches = await Tranche.getByPoolId(poolId.toString())
  for (const tranche of tranches) {
    const trancheService = await TrancheService.getById(`${tranche.poolId}-${tranche.trancheId}`)
    await trancheService.updateTranchePrice(epochId.toNumber())
    await trancheService.updateTrancheSupply()
    await trancheService.save()
  }

  const poolService = await PoolService.getById(poolId.toString())
  await poolService.executeEpoch(epochId.toNumber())
  await poolService.save()

  // TODO: loop over OutstandingOrder, apply fulfillment from epoch, create InvestorTransactions, optionally remove orders
  //const orders = await OutstandingOrder.getByPoolId(poolId.toString())
  //logger.info(`Orders: ${JSON.stringify(orders)}`)
}
