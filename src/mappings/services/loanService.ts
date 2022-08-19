import { Loan } from '../../types'

export class LoanService {
  readonly loan: Loan

  constructor(loan: Loan) {
    this.loan = loan
  }

  static init = async (poolId: string, loanId: string, timestamp: Date) => {
    logger.info(`Initialising loan ${loanId} for pool ${poolId}`)
    const loan = new Loan(`${poolId}-${loanId}`)

    loan.createdAt = timestamp
    loan.outstandingDebt = BigInt(0)

    return new LoanService(loan)
  }

  static getById = async (poolId: string, loanId: string) => {
    const loan = await Loan.get(`${poolId}-${loanId}`)
    if (loan === undefined) return undefined
    return new LoanService(loan)
  }

  save = async () => {
    await this.loan.save()
  }

  increaseOutstandingDebt = (amount: bigint) => {
    this.loan.outstandingDebt = this.loan.outstandingDebt + amount
  }
}
