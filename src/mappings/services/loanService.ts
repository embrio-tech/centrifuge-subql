import { AnyJson } from '@polkadot/types/types'
import { Loan, LoanStatus } from '../../types'

export class LoanService {
  readonly loan: Loan

  constructor(loan: Loan) {
    this.loan = loan
  }

  static init = async (poolId: string, loanId: string, timestamp: Date) => {
    logger.info(`Initialising loan ${loanId} for pool ${poolId}`)
    const loan = new Loan(`${poolId}-${loanId}`)

    loan.createdAt = timestamp
    loan.poolId = poolId
    loan.status = LoanStatus.CREATED
    loan.outstandingDebt = BigInt(0)

    return new LoanService(loan)
  }

  static getById = async (poolId: string, loanId: string) => {
    const loan = await Loan.get(`${poolId}-${loanId}`)
    if (loan === undefined) return undefined
    return new LoanService(loan)
  }

  public save = async () => {
    await this.loan.save()
  }

  public increaseOutstandingDebt = (amount: bigint) => {
    logger.info(`Increasing outstanding debt for loan ${this.loan.id} by ${amount}`)
    this.loan.outstandingDebt = this.loan.outstandingDebt + amount
  }

  public updateInterestRate = (interestRatePerSec: bigint) => {
    logger.info(`Updating interest rate for loan ${this.loan.id} to ${interestRatePerSec}`)
    this.loan.interestRatePerSec = interestRatePerSec
  }

  public updateLoanType = (loanType: string, loanSpec?: AnyJson) => {
    logger.info(`Updating loan type for loan ${this.loan.id} to ${loanType}`)
    this.loan.type = loanType
    const specBuff = Buffer.from(JSON.stringify(loanSpec))
    this.loan.spec = specBuff.toString('base64')
  }

  public activate = () => {
    logger.info(`Activating loan ${this.loan.id}`)
    this.loan.status = LoanStatus.ACTIVE
  }
}
