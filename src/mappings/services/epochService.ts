import { Option } from '@polkadot/types'
import { bnToBn, nToBigInt } from '@polkadot/util'
import { CPREC, RAY_DIGITS, WAD, WAD_DIGITS } from '../../config'
import { EpochDetails } from '../../helpers/types'
import { Epoch, EpochState } from '../../types'

export class EpochService extends Epoch {
  readonly states: EpochState[]

  constructor(id) {
    super(id)
    this.states = []
  }

  static async init(poolId: string, epochNr: number, trancheIds: string[], timestamp: Date) {
    logger.info(`Initialising epoch ${epochNr} for pool ${poolId}`)
    const epoch = new this(`${poolId}-${epochNr.toString()}`)

    epoch.index = epochNr
    epoch.poolId = poolId
    epoch.openedAt = timestamp

    epoch.totalBorrowed = BigInt(0)
    epoch.totalRepaid = BigInt(0)
    epoch.totalInvested = BigInt(0)
    epoch.totalRedeemed = BigInt(0)

    for (const trancheId of trancheIds) {
      const epochState = new EpochState(`${poolId}-${epochNr}-${trancheId}`)
      epochState.epochId = epoch.id
      epochState.trancheId = trancheId
      epochState.outstandingInvestOrders = BigInt(0)
      epochState.outstandingRedeemOrders = BigInt(0)
      epochState.outstandingRedeemOrdersCurrency = BigInt(0)
      epoch.states.push(epochState)
    }
    return epoch
  }

  static async getById(poolId: string, epochNr: number) {
    const epoch = (await this.get(`${poolId}-${epochNr.toString()}`)) as EpochService
    if (epoch === undefined) return undefined
    const epochStates = await EpochState.getByEpochId(`${poolId}-${epochNr.toString()}`)
    epoch.states.push(...epochStates)
    return epoch
  }

  async save() {
    await Promise.all(this.states.map((epochState) => epochState.save()))
    await this.save()
  }

  public closeEpoch(timestamp: Date) {
    this.closedAt = timestamp
  }

  public async executeEpoch(timestamp: Date, digits: number) {
    logger.info(`Updating EpochExecutionDetails for pool ${this.poolId} on epoch ${this.index}`)

    this.executedAt = timestamp

    for (const epochState of this.states) {
      logger.info(`Querying execution information for tranche :${epochState.trancheId}`)
      const epochResponse = await api.query.pools.epoch<Option<EpochDetails>>(epochState.trancheId, this.index)
      logger.info(`EpochResponse: ${JSON.stringify(epochResponse)}`)

      if (epochResponse.isNone) throw new Error('No epoch details')

      const epochDetails = epochResponse.unwrap()
      epochState.price = epochDetails.tokenPrice.toBigInt()
      epochState.investFulfillment = epochDetails.investFulfillment.toBigInt()
      epochState.redeemFulfillment = epochDetails.redeemFulfillment.toBigInt()
      epochState.fulfilledInvestOrders = nToBigInt(
        bnToBn(epochState.outstandingInvestOrders).mul(epochDetails.investFulfillment.toBn()).div(WAD)
      )
      epochState.fulfilledRedeemOrders = nToBigInt(
        bnToBn(epochState.outstandingRedeemOrders).mul(epochDetails.redeemFulfillment.toBn()).div(WAD)
      )
      epochState.fulfilledRedeemOrdersCurrency = this.computeCurrencyAmount(
        epochState.fulfilledRedeemOrders,
        epochState.price,
        digits
      )

      this.totalInvested += epochState.fulfilledInvestOrders
      this.totalRedeemed += epochState.fulfilledRedeemOrdersCurrency
    }
    return this
  }

  public updateOutstandingInvestOrders(trancheId: string, newAmount: bigint, oldAmount: bigint) {
    const trancheState = this.states.find((trancheState) => trancheState.trancheId === trancheId)
    if (trancheState === undefined) throw new Error(`No epochState with could be found for tranche: ${trancheId}`)
    trancheState.outstandingInvestOrders = trancheState.outstandingInvestOrders + newAmount - oldAmount
    return this
  }

  public updateOutstandingRedeemOrders(
    trancheId: string,
    newAmount: bigint,
    oldAmount: bigint,
    tokenPrice: bigint,
    digits: number
  ) {
    const trancheState = this.states.find((trancheState) => trancheState.trancheId === trancheId)
    if (trancheState === undefined) throw new Error(`No epochState with could be found for tranche: ${trancheId}`)
    trancheState.outstandingRedeemOrders = trancheState.outstandingRedeemOrders + newAmount - oldAmount
    trancheState.outstandingRedeemOrdersCurrency = this.computeCurrencyAmount(
      trancheState.outstandingRedeemOrders,
      tokenPrice,
      digits
    )
    return this
  }

  private computeCurrencyAmount(amount: bigint, price: bigint, digits: number) {
    return nToBigInt(
      bnToBn(amount)
        .mul(bnToBn(price))
        .div(CPREC(RAY_DIGITS + WAD_DIGITS - digits))
    )
  }
}
