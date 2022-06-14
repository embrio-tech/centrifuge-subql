import { SubstrateEvent } from '@subql/types'
import { errorHandler } from '../helpers/errorHandler'
import { LoanEvent } from '../helpers/types'
import { EpochService } from './services/epochService'
import { PoolService } from './services/poolsService'
import { TrancheService } from './services/trancheService'

export const handlePoolCreated = errorHandler(_handlePoolCreated)
async function _handlePoolCreated(event: SubstrateEvent): Promise<void> {
  const [poolId, admin] = event.event.data
  logger.info(`Pool ${poolId.toString()} created in block ${event.block.block.header.number}`)

  // Initialise Pool
  const poolService = await PoolService.init(
    poolId.toString(),
    event.block.timestamp,
    event.block.block.header.number.toNumber()
  )
  await poolService.save()
  const { ids, tranches } = poolService.tranches

  // Initialise the tranches
  for (const [index, trancheData] of tranches.entries()) {
    const trancheId = ids.toArray()[index].toHex()
    logger.info(`Creating tranche with id: ${trancheId}`)
    const trancheService = await TrancheService.init(trancheId, poolId.toString(), trancheData)
    await trancheService.updateTranchePrice(1)
    await trancheService.updateTrancheSupply()
    await trancheService.save()
  }

  const epochService = new EpochService()
  await epochService.init(poolId.toString(), 1, event.block.timestamp)
}

export const handleBorrowings = errorHandler(_handleBorrowings)
async function _handleBorrowings(event: SubstrateEvent): Promise<void> {
  const [poolId, loanId, amount] = event.event.data as unknown as LoanEvent
  logger.info(`Pool: ${poolId.toString()} borrowed ${amount.toString()}`)
  const poolService = await PoolService.getById(poolId.toString())
  await poolService.increaseTotalBorrowings(amount.toBigInt())
  await poolService.save()
}
