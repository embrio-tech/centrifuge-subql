import { u128 } from '@polkadot/types'
import { bnToBn, nToBigInt } from '@polkadot/util'
import { paginatedGetter } from '../../helpers/paginatedGetter'
import { CPREC, RAY, RAY_DIGITS, WAD_DIGITS } from '../../config'
import { ExtendedRpc, TrancheDetails } from '../../helpers/types'
import { Tranche, TrancheSnapshot } from '../../types'
import { TrancheProps } from 'centrifuge-subql/types/models/Tranche'

export class TrancheService extends Tranche {
  static init(poolId: string, trancheId: string, index: number, trancheData: TrancheDetails) {
    const tranche = new this(`${poolId}-${trancheId}`)
    tranche.isActive = true
    tranche.sumOutstandingInvestOrders_ = BigInt(0)
    tranche.sumOutstandingRedeemOrders_ = BigInt(0)
    tranche.sumOutstandingRedeemOrdersCurrency_ = BigInt(0)
    tranche.sumFulfilledInvestOrders_ = BigInt(0)
    tranche.sumFulfilledRedeemOrders_ = BigInt(0)
    tranche.sumFulfilledRedeemOrdersCurrency_ = BigInt(0)
    tranche.tokenPrice = nToBigInt(RAY)

    tranche.type = 'ALL'
    tranche.poolId = poolId
    tranche.trancheId = trancheId
    tranche.index = index
    tranche.isResidual = trancheData.trancheType.isResidual
    tranche.seniority = trancheData.seniority.toNumber()
    tranche.sumDebt = trancheData.debt.toBigInt()

    if (!tranche.isResidual) {
      tranche.interestRatePerSec = trancheData.trancheType.asNonResidual.interestRatePerSec.toBigInt()
      tranche.minRiskBuffer = trancheData.trancheType.asNonResidual.minRiskBuffer.toBigInt()
    }

    return tranche
  }

  static async getById(poolId: string, trancheId: string) {
    const tranche = (await this.get(`${poolId}-${trancheId}`)) as TrancheService
    return tranche
  }

  static async getOrInit(poolId: string, trancheId: string, index: number, trancheData: TrancheDetails) {
    let tranche = await this.getById(poolId, trancheId)
    if (tranche === undefined) {
      tranche = this.init(poolId, trancheId, index, trancheData)
      await tranche.save()
    }
    return tranche
  }

  static async getByPoolId(poolId: string) {
    const tranches = (await paginatedGetter('Tranche', 'poolId', poolId)).map((tranche) =>
      this.create(tranche as TrancheProps)
    )
    return tranches as TrancheService[]
  }

  static async getActives(poolId: string) {
    const tranches = (await this.getByPoolId(poolId)) as TrancheService[]
    const activeTranches = tranches.filter((state) => state.isActive === true)
    return activeTranches
  }

  public async updateSupply() {
    const requestPayload = { Tranche: [this.poolId, this.trancheId] }
    const supplyResponse = await api.query.ormlTokens.totalIssuance<u128>(requestPayload)
    logger.info(`SupplyResponse: ${JSON.stringify(supplyResponse)}`)
    this.tokenSupply = supplyResponse.toBigInt()
    return this
  }

  public updatePrice(price: bigint) {
    logger.info(`Updating price for tranche ${this.id} to :${price}`)
    this.tokenPrice = price
    return this
  }

  public async updatePriceFromRpc() {
    logger.info(`Qerying RPC price for tranche ${this.id}`)
    const poolId = this.poolId
    const tokenPrices = await (api.rpc as ExtendedRpc).pools.trancheTokenPrices(poolId)
    const trancheTokenPrice = tokenPrices[this.index].toBigInt()
    if (trancheTokenPrice <= BigInt(0)) throw new Error(`Zero or negative price returned for tranche: ${this.id}`)
    this.updatePrice(trancheTokenPrice)
    return this
  }

  public updateDebt(debt: bigint) {
    logger.info(`Updating debt for tranche ${this.id} to :${debt}`)
    this.sumDebt = debt
    return this
  }

  public async computeYield(yieldField: string, referencePeriodStart?: Date) {
    logger.info(
      `Computing yield for tranche ${this.trancheId} of ` +
        `pool ${this.poolId} with reference date ${referencePeriodStart}`
    )

    let trancheSnapshot: TrancheSnapshot
    if (referencePeriodStart) {
      const trancheSnapshots = await TrancheSnapshot.getByPeriodStart(referencePeriodStart)
      if (trancheSnapshots.length === 0) {
        logger.warn(`No tranche snapshot exist for pool ${this.poolId} with reference date ${referencePeriodStart}`)
        return this
      }

      trancheSnapshot = trancheSnapshots.find((snapshot) => snapshot.trancheId === `${this.poolId}-${this.trancheId}`)
      if (trancheSnapshot === undefined) {
        logger.warn(
          `No tranche snapshot found tranche ${this.poolId}-${this.trancheId} with ` +
            `reference date ${referencePeriodStart}`
        )
        return this
      }
      if (typeof this.tokenPrice !== 'bigint') {
        logger.warn('Price information missing')
        return this
      }
    }
    const priceCurrent = bnToBn(this.tokenPrice)
    const priceOld = referencePeriodStart ? bnToBn(trancheSnapshot.tokenPrice) : RAY
    this[yieldField] = nToBigInt(priceCurrent.mul(RAY).div(priceOld).sub(RAY))
    return this
  }

  public async computeYieldAnnualized(yieldField: string, currentPeriodStart: Date, referencePeriodStart: Date) {
    logger.info(
      `Computing annualized yield for tranche ${this.trancheId} of ` +
        `pool ${this.poolId} with reference date ${referencePeriodStart}`
    )
    const trancheSnapshots = await TrancheSnapshot.getByPeriodStart(referencePeriodStart)
    if (trancheSnapshots.length === 0) {
      logger.warn(`No tranche snapshot found pool ${this.poolId} with reference date ${referencePeriodStart}`)
      return this
    }
    const trancheSnapshot = trancheSnapshots.find(
      (snapshot) => snapshot.trancheId === `${this.poolId}-${this.trancheId}`
    )
    if (trancheSnapshot === undefined) {
      logger.warn(
        `No tranche snapshot found tranche ${this.poolId}-${this.poolId} with ` +
          `reference date ${referencePeriodStart}`
      )
      return this
    }
    if (typeof this.tokenPrice !== 'bigint') {
      logger.warn('Price information missing')
      return this
    }
    const annualizationFactor = bnToBn(365 * 24 * 3600 * 1000).div(
      bnToBn(currentPeriodStart.valueOf() - referencePeriodStart.valueOf())
    )
    const priceCurrent = bnToBn(this.tokenPrice)
    const priceOld = bnToBn(trancheSnapshot.tokenPrice)
    this[yieldField] = nToBigInt(priceCurrent.mul(RAY).div(priceOld).sub(RAY).mul(annualizationFactor))
    return this
  }

  public updateOutstandingInvestOrders = (newAmount: bigint, oldAmount: bigint) => {
    this.sumOutstandingInvestOrders_ = this.sumOutstandingInvestOrders_ + newAmount - oldAmount
    return this
  }

  public updateOutstandingRedeemOrders(newAmount: bigint, oldAmount: bigint, digits: number) {
    this.sumOutstandingRedeemOrders_ = this.sumOutstandingRedeemOrders_ + newAmount - oldAmount
    this.sumOutstandingRedeemOrdersCurrency_ = this.computeCurrencyAmount(this.sumOutstandingRedeemOrders_, digits)
    return this
  }

  public updateFulfilledInvestOrders(amount: bigint) {
    this.sumFulfilledInvestOrders_ = this.sumFulfilledInvestOrders_ + amount
    return this
  }

  public updateFulfilledRedeemOrders(amount: bigint, digits: number) {
    this.sumFulfilledRedeemOrders_ = this.sumFulfilledRedeemOrders_ + amount
    this.sumFulfilledRedeemOrdersCurrency_ = this.computeCurrencyAmount(this.sumFulfilledRedeemOrders_, digits)
    return this
  }

  private computeCurrencyAmount(amount: bigint, digits: number) {
    return nToBigInt(
      bnToBn(amount)
        .mul(bnToBn(this.tokenPrice))
        .div(CPREC(RAY_DIGITS + WAD_DIGITS - digits))
    )
  }

  public deactivate() {
    this.isActive = false
  }

  public activate() {
    this.isActive = true
  }
}
