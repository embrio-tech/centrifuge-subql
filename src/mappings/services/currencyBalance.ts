import { AccountData } from '../../helpers/types'
import { CurrencyBalance } from '../../types/models/CurrencyBalance'

export class CurrencyBalanceService extends CurrencyBalance {
  static init(address: string, currency: string) {
    logger.info(`Initialising new CurrencyBalance: ${address}-${currency}`)
    const currencyBalance = new this(`${address}-${currency}`)
    currencyBalance.accountId = address
    currencyBalance.currencyId = currency
    currencyBalance.amount = BigInt(0)
    return currencyBalance
  }

  static async getById(address: string, currency: string) {
    const id = `${address}-${currency}`
    const currencyBalance = await this.get(id)
    return currencyBalance as CurrencyBalanceService
  }

  static async getOrInit(address: string, currency: string) {
    let currencyBalance = await this.getById(address, currency)
    if (currencyBalance === undefined) {
      currencyBalance = this.init(address, currency)
      await currencyBalance.getBalance()
      await currencyBalance.save()
    }
    return currencyBalance
  }

  public async getBalance() {
    const balanceResponse = await api.query.ormlTokens.accounts<AccountData>(this.accountId, this.currencyId)
    this.amount = balanceResponse.free.toBigInt()
  }

  public credit(amount: bigint) {
    this.amount += amount
  }

  public debit(amount: bigint) {
    this.amount -= amount
  }
}
