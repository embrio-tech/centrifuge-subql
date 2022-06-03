import { SubstrateBlock } from '@subql/types'
import { PoolState, PoolSnapshot, TrancheState, TrancheSnapshot, Timekeeper, Pool, Tranche } from '../types'
import { getPeriodStart, MemTimekeeper } from '../helpers/timeKeeping'
import { errorHandler } from '../helpers/errorHandler'
import { stateSnapshotter } from '../helpers/stateSnapshot'
import { updatePoolNav, updatePoolState } from './pools'
import { computeTrancheYield, updateTranchePrice } from './tranches'
import { SNAPSHOT_INTERVAL_SECONDS } from '../config'

const memTimekeeper = initialiseMemTimekeeper()

export const handleBlock = errorHandler(_handleBlock)
async function _handleBlock(block: SubstrateBlock): Promise<void> {
  const blockPeriodStart = getPeriodStart(block.timestamp)
  const blockNumber = block.block.header.number.toNumber()
  const newPeriod = (await memTimekeeper).processBlock(block)

  if (newPeriod) {
    logger.info(`It's a new period on block ${blockNumber}: ${block.timestamp.toISOString()}`)
    const lastPeriodStart = new Date(blockPeriodStart.valueOf() - SNAPSHOT_INTERVAL_SECONDS * 1000)

    // Update Pool States
    const pools = await Pool.getByType('ALL')
    for (const pool of pools) {
      await updatePoolState(pool.id)
      await updatePoolNav(pool.id)

      // Update tranche states
      const tranches = await Tranche.getByPoolId(pool.id)
      for (const tranche of tranches) {
        await updateTranchePrice(pool.id, tranche.trancheId, pool.currentEpoch)
        await computeTrancheYield(pool.id, tranche.trancheId, lastPeriodStart)
      }
    }

    //Perform Snapshots and reset
    await stateSnapshotter(PoolState, PoolSnapshot, block, 'poolId')
    await stateSnapshotter(TrancheState, TrancheSnapshot, block, 'trancheId')

    //Update Timekeeper
    const timekeeper = new Timekeeper('global')
    timekeeper.lastPeriodStart = blockPeriodStart
    await timekeeper.save()
  }
}

async function initialiseMemTimekeeper(): Promise<MemTimekeeper> {
  let lastPeriodStart: Date
  try {
    lastPeriodStart = (await Timekeeper.get('global')).lastPeriodStart
  } catch (error) {
    lastPeriodStart = new Date(0)
  }
  return new MemTimekeeper(lastPeriodStart)
}
