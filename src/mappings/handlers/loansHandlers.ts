import { SubstrateEvent } from '@subql/types'
import { LoanBorrowedEvent, LoanCreatedClosedEvent } from '../../helpers/types'
import { errorHandler } from '../../helpers/errorHandler'
import { PoolService } from '../services/poolService'
import { LoanService } from '../services/loanService'

export const handleLoanCreated = errorHandler(_handleLoanCreated)
async function _handleLoanCreated(event: SubstrateEvent<LoanCreatedClosedEvent>) {
  const [poolId, loanId, collateral] = event.event.data
  logger.info(`Loan created event for pool: ${poolId.toString()} loan: ${loanId.toString()}`)

  const loan = await LoanService.init(poolId.toString(), loanId.toString(), event.block.timestamp)
  await loan.save()
}

export const handleBorrowings = errorHandler(_handleBorrowings)
async function _handleBorrowings(event: SubstrateEvent<LoanBorrowedEvent>): Promise<void> {
  const [poolId, , amount] = event.event.data
  logger.info(`Pool: ${poolId.toString()} borrowed ${amount.toString()}`)
  const poolService = await PoolService.getById(poolId.toString())
  await poolService.increaseTotalBorrowings(amount.toBigInt())
  await poolService.save()
}
