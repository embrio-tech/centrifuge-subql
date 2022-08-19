import { Loan } from '../../types'

export class LoanService {
  readonly loan: Loan

  constructor(loan: Loan) {
    this.loan = loan
  }

  static init = async (poolId: string, loanId: number, timestamp: Date) => {
    logger.info(`Initialising loan ${loanId} for pool ${poolId}`)
    const loan = new Loan(`${poolId}-${loanId.toString()}`)

    loan.createdAt = timestamp
    // init logic

    return new LoanService(loan)
  }

  static getById = async (loanId: string) => {
    const loan = await Loan.get(loanId)
    if (loan === undefined) return undefined
    return new LoanService(loan)
  }

  save = async () => {
    await this.loan.save()
  }
}
