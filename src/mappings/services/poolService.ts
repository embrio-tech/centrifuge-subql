import { Option, u128, Vec } from '@polkadot/types'
import { bnToBn, nToBigInt } from '@polkadot/util'
import { paginatedGetter } from '../../helpers/paginatedGetter'
import {
  ExtendedCall,
  ExtendedRpc,
  NavDetails,
  PoolDetails,
  PoolFeesList,
  PoolMetadata,
  PoolNav,
  TrancheDetails,
} from '../../helpers/types'
import { Pool } from '../../types'
import { cid, readIpfs } from '../../helpers/ipfsFetch'

export class PoolService extends Pool {
  static seed(poolId: string) {
    logger.info(`Seeding pool ${poolId}`)
    return new this(`${poolId}`, 'ALL', false)
  }

  static async getOrSeed(poolId: string, saveSeed = true) {
    let pool = await this.getById(poolId)
    if (!pool) {
      pool = this.seed(poolId)
      if (saveSeed) await pool.save()
    }
    return pool
  }

  public init(
    currencyId: string,
    maxReserve: bigint,
    maxPortfolioValuationAge: number,
    minEpochTime: number,
    timestamp: Date,
    blockNumber: number
  ) {
    logger.info(`Initialising pool ${this.id}`)
    this.isActive = true
    this.createdAt = timestamp
    this.createdAtBlockNumber = blockNumber

    this.minEpochTime = minEpochTime
    this.maxPortfolioValuationAge = maxPortfolioValuationAge

    this.currentEpoch = 1

    this.portfolioValuation = BigInt(0)
    this.totalReserve = BigInt(0)
    this.availableReserve = BigInt(0)
    this.maxReserve = maxReserve

    this.sumDebt = BigInt(0)
    this.value = BigInt(0)

    this.sumNumberOfActiveAssets = BigInt(0)
    this.sumDebtOverdue = BigInt(0)
    this.sumDebtWrittenOffByPeriod = BigInt(0)

    this.sumBorrowedAmountByPeriod = BigInt(0)
    this.sumRepaidAmountByPeriod = BigInt(0)
    this.sumPrincipalRepaidAmountByPeriod = BigInt(0)
    this.sumInterestRepaidAmountByPeriod = BigInt(0)
    this.sumUnscheduledRepaidAmountByPeriod = BigInt(0)
    this.sumInvestedAmountByPeriod = BigInt(0)
    this.sumRedeemedAmountByPeriod = BigInt(0)
    this.sumNumberOfAssetsByPeriod = BigInt(0)

    this.sumBorrowedAmount = BigInt(0)
    this.sumRepaidAmount = BigInt(0)
    this.sumPrincipalRepaidAmount = BigInt(0)
    this.sumInterestRepaidAmount = BigInt(0)
    this.sumUnscheduledRepaidAmount = BigInt(0)
    this.sumNumberOfAssets = BigInt(0)

    this.currencyId = currencyId

    return this
  }

  public async initData() {
    logger.info(`Initialising data for pool: ${this.id}`)
    const [poolReq, metadataReq] = await Promise.all([
      api.query.poolSystem.pool<Option<PoolDetails>>(this.id),
      api.query.poolRegistry.poolMetadata<Option<PoolMetadata>>(this.id),
    ])

    if (poolReq.isNone) throw new Error('No pool data available to create the pool')

    const poolData = poolReq.unwrap()
    this.metadata = metadataReq.isSome ? metadataReq.unwrap().metadata.toUtf8() : null
    this.minEpochTime = poolData.parameters.minEpochTime.toNumber()
    this.maxPortfolioValuationAge = poolData.parameters.maxNavAge.toNumber()
    return this
  }

  public async initIpfsMetadata() {
    if (!this.metadata) {
      logger.warn('No IPFS metadata')
      return
    }
    const metadata = await readIpfs<PoolIpfsMetadata>(this.metadata.match(cid)[0])
    this.name = metadata.pool.name
    this.assetClass = metadata.pool.asset.class
    this.assetSubclass = metadata.pool.asset.subClass
    this.icon = metadata.pool.icon.uri
  }

  public async getIpfsPoolFeeName(poolFeeId: string): Promise<string> {
    if (!this.metadata) return logger.warn('No IPFS metadata')
    const metadata = await readIpfs<PoolIpfsMetadata>(this.metadata.match(cid)[0])
    return metadata.pool.poolFees.find((elem) => elem.id.toString(10) === poolFeeId)?.name ?? null
  }

  static async getById(poolId: string) {
    return this.get(poolId) as Promise<PoolService>
  }

  static async getAll() {
    const pools = (await paginatedGetter('Pool', 'type', 'ALL')) as PoolService[]
    return pools.map((pool) => this.create(pool) as PoolService)
  }

  static async getActivePools() {
    logger.info('Fetching active pools')
    const pools = (await paginatedGetter('Pool', 'isActive', true)) as PoolService[]
    return pools.map((pool) => this.create(pool) as PoolService)
  }

  public async updateState() {
    const poolResponse = await api.query.poolSystem.pool<Option<PoolDetails>>(this.id)
    logger.info(`Updating state for pool: ${this.id}`)
    if (poolResponse.isSome) {
      const poolData = poolResponse.unwrap()
      this.totalReserve = poolData.reserve.total.toBigInt()
      this.availableReserve = poolData.reserve.available.toBigInt()
      this.maxReserve = poolData.reserve.max.toBigInt()
    }
    return this
  }

  public updatePortfolioValuation() {
    const specVersion = api.runtimeVersion.specVersion.toNumber()
    const specName = api.runtimeVersion.specName.toString()
    switch (specName) {
      case 'centrifuge-devel':
        return specVersion < 1038 ? this.updatePortfolioValuationQuery() : this.updatePortfolioValuationCall()
      default:
        return specVersion < 1025 ? this.updatePortfolioValuationQuery() : this.updatePortfolioValuationCall()
    }
  }

  private async updatePortfolioValuationQuery() {
    logger.info(`Updating portfolio valuation for pool: ${this.id} (state)`)
    const navResponse = await api.query.loans.portfolioValuation<NavDetails>(this.id)
    this.portfolioValuation = navResponse.value.toBigInt()
    logger.info(`portfolio valuation: ${this.portfolioValuation.toString(10)}`)
    return this
  }

  private async updatePortfolioValuationCall() {
    logger.info(`Updating portfolio valuation for pool: ${this.id} (runtime)`)
    const apiCall = api.call as ExtendedCall
    const navResponse = await apiCall.poolsApi.nav(this.id)
    if (navResponse.isEmpty) logger.warn('Empty pv response')
    this.portfolioValuation = navResponse
      .unwrapOr<Pick<PoolNav, 'total'>>({ total: api.registry.createType('Balance', 0) })
      .total.toBigInt()
    logger.info(`portfolio valuation: ${this.portfolioValuation.toString(10)}`)
    return this
  }

  public increaseNumberOfAssets() {
    this.sumNumberOfAssetsByPeriod += BigInt(1)
    this.sumNumberOfAssets += BigInt(1)
  }

  public updateNumberOfActiveAssets(numberOfActiveAssets: bigint) {
    this.sumNumberOfActiveAssets = numberOfActiveAssets
  }

  public increaseBorrowings(borrowedAmount: bigint) {
    this.sumBorrowedAmountByPeriod += borrowedAmount
    this.sumBorrowedAmount += borrowedAmount
  }

  public increaseRepayments(
    principalRepaidAmount: bigint,
    interestRepaidAmount: bigint,
    unscheduledRepaidAmount: bigint
  ) {
    this.sumRepaidAmountByPeriod += principalRepaidAmount + interestRepaidAmount + unscheduledRepaidAmount
    this.sumRepaidAmount += principalRepaidAmount + interestRepaidAmount + unscheduledRepaidAmount
    this.sumPrincipalRepaidAmountByPeriod += principalRepaidAmount
    this.sumPrincipalRepaidAmount += principalRepaidAmount
    this.sumInterestRepaidAmountByPeriod += interestRepaidAmount
    this.sumInterestRepaidAmount += interestRepaidAmount
    this.sumUnscheduledRepaidAmountByPeriod += unscheduledRepaidAmount
    this.sumUnscheduledRepaidAmount += unscheduledRepaidAmount
  }

  public increaseInvestments(currencyAmount: bigint) {
    this.sumInvestedAmountByPeriod += currencyAmount
  }

  public increaseRedemptions(currencyAmount: bigint) {
    this.sumRedeemedAmountByPeriod += currencyAmount
  }

  public closeEpoch(epochId: number) {
    this.lastEpochClosed = epochId
    this.currentEpoch = epochId + 1
  }

  public executeEpoch(epochId: number) {
    this.lastEpochExecuted = epochId
  }

  public computePoolValue() {
    const nav = bnToBn(this.portfolioValuation)
    const totalReserve = bnToBn(this.totalReserve)
    this.value = nToBigInt(nav.add(totalReserve))
  }

  public resetDebtOverdue() {
    this.sumDebtOverdue = BigInt(0)
  }

  public increaseDebtOverdue(amount: bigint) {
    this.sumDebtOverdue += amount
  }

  public increaseWriteOff(amount: bigint) {
    this.sumDebtWrittenOffByPeriod += amount
  }

  public async getTranches() {
    const poolResponse = await api.query.poolSystem.pool<Option<PoolDetails>>(this.id)
    logger.info(`Fetching tranches for pool: ${this.id}`)

    if (poolResponse.isNone) throw new Error('Unable to fetch pool data!')

    const poolData = poolResponse.unwrap()
    const { ids, tranches } = poolData.tranches

    return tranches.reduce<PoolTranches>((obj, data, index) => ({ ...obj, [ids[index].toHex()]: { index, data } }), {})
  }

  public async getPortfolio(): Promise<ActiveLoanData> {
    const apiCall = api.call as ExtendedCall
    logger.info(`Querying runtime loansApi.portfolio for pool: ${this.id}`)
    const portfolioData = await apiCall.loansApi.portfolio(this.id)
    logger.info(`${portfolioData.length} assets found.`)
    return portfolioData.reduce<ActiveLoanData>((obj, current) => {
      const totalRepaid = current[1].activeLoan.totalRepaid
      const maturityDate = new Date(current[1].activeLoan.schedule.maturity.asFixed.date.toNumber() * 1000)
      obj[current[0].toString(10)] = {
        outstandingPrincipal: current[1].outstandingPrincipal.toBigInt(),
        outstandingInterest: current[1].outstandingInterest.toBigInt(),
        outstandingDebt: current[1].outstandingPrincipal.toBigInt() + current[1].outstandingInterest.toBigInt(),
        presentValue: current[1].presentValue.toBigInt(),
        actualMaturityDate: new Date(current[1].activeLoan.schedule.maturity.asFixed.date.toNumber() * 1000),
        timeToMaturity: Math.round((maturityDate.valueOf() - Date.now().valueOf()) / 1000),
        actualOriginationDate: new Date(current[1].activeLoan.originationDate.toNumber() * 1000),
        writeOffPercentage: current[1].activeLoan.writeOffPercentage.toBigInt(),
        totalBorrowed: current[1].activeLoan.totalBorrowed.toBigInt(),
        totalRepaid:
          totalRepaid.principal.toBigInt() + totalRepaid.interest.toBigInt() + totalRepaid.unscheduled.toBigInt(),
        totalRepaidPrincipal: totalRepaid.principal.toBigInt(),
        totalRepaidInterest: totalRepaid.interest.toBigInt(),
        totalRepaidUnscheduled: totalRepaid.unscheduled.toBigInt(),
      }
      return obj
    }, {})
  }

  public async getTrancheTokenPrices() {
    logger.info(`Querying RPC tranche token prices for pool ${this.id}`)
    const poolId = this.id
    let tokenPrices: Vec<u128>
    try {
      tokenPrices = await (api.rpc as ExtendedRpc).pools.trancheTokenPrices(poolId)
    } catch (err) {
      logger.error(`Unable to fetch tranche token prices for pool: ${this.id}: ${err}`)
      tokenPrices = undefined
    }
    return tokenPrices
  }

  public async getAccruedFees() {
    const apiCall = api.call as ExtendedCall
    const specVersion = api.runtimeVersion.specVersion.toNumber()
    const specName = api.runtimeVersion.specName.toString()
    switch (specName) {
      case 'centrifuge-devel':
        if (specVersion < 1040) return []
        break
      default:
        if (specVersion < 1026) return []
        break
    }
    logger.info(`Querying runtime poolFeesApi.listFees for pool ${this.id}`)
    const poolFeesListRequest = await apiCall.poolFeesApi.listFees(this.id)
    const poolFeesList = poolFeesListRequest.unwrapOr(<PoolFeesList>[])
    const fees = poolFeesList.flatMap((poolFee) => poolFee.fees.filter((fee) => fee.amounts.feeType.isFixed))
    const accruedFees = fees.map((fee): [feeId: string, pending: bigint, disbursement: bigint] => [
      fee.id.toString(),
      fee.amounts.pending.toBigInt(),
      fee.amounts.disbursement.toBigInt(),
    ])
    return accruedFees
  }
}

export interface ActiveLoanData {
  [loanId: string]: {
    outstandingPrincipal: bigint
    outstandingInterest: bigint
    outstandingDebt: bigint
    presentValue: bigint
    actualMaturityDate: Date
    timeToMaturity: number
    actualOriginationDate: Date
    writeOffPercentage: bigint
    totalBorrowed: bigint
    totalRepaid: bigint
    totalRepaidPrincipal: bigint
    totalRepaidInterest: bigint
    totalRepaidUnscheduled: bigint
  }
}

interface PoolTranches {
  [trancheId: string]: { index: number; data: TrancheDetails }
}

interface PoolIpfsMetadata {
  version: number
  pool: {
    name: string
    icon: { uri: string; mime: string }
    asset: { class: string; subClass: string }
    poolFees: Array<{ id: number; name: string }>
  }
  [key: string]: unknown
}
