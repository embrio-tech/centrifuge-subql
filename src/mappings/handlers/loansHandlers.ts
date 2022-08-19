import { SubstrateEvent } from '@subql/types'
import { LoanBorrowedEvent, LoanCreatedClosedEvent, LoanPricedEvent, LoanSpecs } from '../../helpers/types'
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

export const handleLoanBorrowed = errorHandler(_handleLoanBorrowed)
async function _handleLoanBorrowed(event: SubstrateEvent<LoanBorrowedEvent>): Promise<void> {
  const [poolId, loanId, amount] = event.event.data
  logger.info(`Pool: ${poolId.toString()} borrowed ${amount.toString()}`)

  // Update loan amount
  const loan = await LoanService.getById(poolId.toString(), loanId.toString())
  await loan.increaseOutstandingDebt(amount.toBigInt())
  await loan.save()

  // Update poolState info
  const poolService = await PoolService.getById(poolId.toString())
  await poolService.increaseTotalBorrowings(amount.toBigInt())
  await poolService.save()
}

export const handleLoanPriced = errorHandler(_handleLoanPriced)
async function _handleLoanPriced(event: SubstrateEvent<LoanPricedEvent>) {
  const [poolId, loanId, interestRatePerSec, loanType] = event.event.data
  logger.info(`Loan priced event for pool: ${poolId.toString()} loan: ${loanId.toString()}`)

  const loan = await LoanService.getById(poolId.toString(), loanId.toString())
  await loan.updateInterestRate(interestRatePerSec.toBigInt())
  await loan.updateLoanType(loanType.type, loanType.toHuman(false))
}
