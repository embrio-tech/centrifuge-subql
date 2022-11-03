import { bnToBn, nToBigInt } from '@polkadot/util'
import { paginatedGetter } from '../../helpers/paginatedGetter'
import { OutstandingOrder } from '../../types'
import { InvestorTransactionData } from './investorTransactionService'

export class OutstandingOrderService extends OutstandingOrder {
  static init(data: InvestorTransactionData, invest: bigint, redeem: bigint) {
    const oo = new this(`${data.poolId}-${data.trancheId}-${data.address}`)
    oo.hash = data.hash
    oo.accountId = data.address
    oo.poolId = data.poolId
    oo.trancheId = `${data.poolId}-${data.trancheId}`
    oo.epochNumber = data.epochNumber
    oo.timestamp = data.timestamp

    oo.invest = invest
    oo.redeem = redeem
    return oo
  }

  static initInvest(data: InvestorTransactionData) {
    return this.init(data, data.amount, BigInt(0))
  }

  static initRedeem(data: InvestorTransactionData) {
    return this.init(data, BigInt(0), data.amount)
  }

  static async getAllByTrancheId(poolId: string, trancheId: string) {
    const entities = (await paginatedGetter(
      'OutstandingOrder',
      'trancheId',
      `${poolId}-${trancheId}`
    )) as OutstandingOrder[]
    return entities.map((ooEntity) => this.create(ooEntity) as OutstandingOrderService)
  }

  updateUnfulfilledInvest(investFulfillment: bigint) {
    this.invest = nToBigInt(bnToBn(this.invest).sub(bnToBn(investFulfillment)))
    return this
  }

  updateUnfulfilledRedeem(redeemFulfillment: bigint) {
    this.redeem = nToBigInt(bnToBn(this.redeem).sub(bnToBn(redeemFulfillment)))
    return this
  }
}
