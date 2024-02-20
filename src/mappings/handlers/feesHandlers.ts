import { SubstrateEvent } from '@subql/types'
import { errorHandler } from '../../helpers/errorHandler'
import {
  PoolFeesAddedEvent,
  PoolFeesChargedEvent,
  PoolFeesPaidEvent,
  PoolFeesProposedEvent,
  PoolFeesRemovedEvent,
  PoolFeesUnchargedEvent,
} from '../../helpers/types'

export const handleFeeProposed = errorHandler(_handleFeeProposed)
async function _handleFeeProposed(event: SubstrateEvent<PoolFeesProposedEvent>): Promise<void> {
  const [poolId, feeId, _bucket, _fee] = event.event.data
  logger.info(
    `Fee with id ${feeId.toString(10)} proposed for pool ${poolId.toString(10)} ` +
      `on block ${event.block.block.header.number.toNumber()}`
  )
}

export const handleFeeAdded = errorHandler(_handleFeeAdded)
async function _handleFeeAdded(event: SubstrateEvent<PoolFeesAddedEvent>): Promise<void> {
  const [poolId, _bucket, feeId, _fee] = event.event.data
  logger.info(
    `Fee with id ${feeId.toString(10)} added for pool ${poolId.toString(10)} ` +
      `on block ${event.block.block.header.number.toNumber()}`
  )
}

export const handleFeeRemoved = errorHandler(_handleFeeRemoved)
async function _handleFeeRemoved(event: SubstrateEvent<PoolFeesRemovedEvent>): Promise<void> {
  const [poolId, _bucket, feeId] = event.event.data
  logger.info(
    `Fee with id ${feeId.toString(10)} removed for pool ${poolId.toString(10)} ` +
      `on block ${event.block.block.header.number.toNumber()}`
  )
}

export const handleFeeCharged = errorHandler(_handleFeeCharged)
async function _handleFeeCharged(event: SubstrateEvent<PoolFeesChargedEvent>): Promise<void> {
  const [poolId, feeId, _amount, _pending] = event.event.data
  logger.info(
    `Fee with id ${feeId.toString(10)} charged for pool ${poolId.toString(10)} ` +
      `on block ${event.block.block.header.number.toNumber()}`
  )
}

export const handleFeeUncharged = errorHandler(_handleFeeUncharged)
async function _handleFeeUncharged(event: SubstrateEvent<PoolFeesUnchargedEvent>): Promise<void> {
  const [poolId, feeId, _amount, _pending] = event.event.data
  logger.info(
    `Fee with id ${feeId.toString(10)} uncharged for pool ${poolId.toString(10)} ` +
      `on block ${event.block.block.header.number.toNumber()}`
  )
}

export const handleFeePaid = errorHandler(_handleFeePaid)
async function _handleFeePaid(event: SubstrateEvent<PoolFeesPaidEvent>): Promise<void> {
  const [poolId, feeId, _amount, _destination] = event.event.data
  logger.info(
    `Fee with id ${feeId.toString(10)} uncharged for pool ${poolId.toString(10)} ` +
      `on block ${event.block.block.header.number.toNumber()}`
  )
}
