import { PoolFeeStatus, PoolFeeType } from '../../types'
import { PoolFee } from '../../types/models'

export interface PoolFeeData {
  poolId: string
  feeId: string
  blockNumber: number
  timestamp: Date
  epochNumber: number
  hash: string
  amount?: bigint
}

export class PoolFeeService extends PoolFee {
  static init(data: PoolFeeData, type: keyof typeof PoolFeeType, status: keyof typeof PoolFeeStatus) {
    const { poolId, feeId } = data
    const _type = PoolFeeType[type]
    const _status = PoolFeeStatus[status]

    Object.getOwnPropertyNames(this)
      .filter((prop) => typeof this[prop] === 'bigint')
      .forEach((prop) => {
        logger.info(`-> initialising ${prop} to 0`)
        this[prop] = BigInt(0)
      })

    return new this(`${poolId}-${feeId}`, feeId, _type, _status, false, poolId)
  }

  static async getOrInit(data: PoolFeeData, type: keyof typeof PoolFeeType, status: keyof typeof PoolFeeStatus) {
    const { poolId, feeId } = data
    let poolFee = (await this.get(`${poolId}-${feeId}`)) as PoolFeeService
    if (!poolFee) {
      poolFee = this.init(data, type, status)
    } else {
      poolFee.status = PoolFeeStatus[status]
    }
    return poolFee
  }

  static getById(poolId: string, feeId: string) {
    return this.get(`${poolId}-${feeId}`) as Promise<PoolFeeService>
  }

  static async propose(data: PoolFeeData, type: keyof typeof PoolFeeType) {
    const poolFee = this.init(data, type, 'PROPOSED')
    return poolFee
  }

  static async add(data: PoolFeeData, type: keyof typeof PoolFeeType) {
    const poolFee = await this.getOrInit(data, type, 'ADDED')
    poolFee.isActive = true
    return poolFee
  }

  static async delete(data: PoolFeeData) {
    const { poolId, feeId } = data
    const poolFee = await this.get(`${poolId}-${feeId}`)
    if(!poolFee) throw new Error('Unable to remove PoolFee. PoolFee does not exist.')
    poolFee.isActive = false
    return poolFee
  }

  public charge(data: Omit<PoolFeeData, 'amount'> & Required<Pick<PoolFeeData, 'amount'>>) {
    if(!this.isActive) throw new Error('Unable to charge inactive PolFee')
    this.sumChargedAmount += data.amount
    this.sumChargedAmountByPeriod += data.amount
    return this
  }

  public uncharge(data: Omit<PoolFeeData, 'amount'> & Required<Pick<PoolFeeData, 'amount'>>) {
    if(!this.isActive) throw new Error('Unable to uncharge inactive PolFee')
    this.sumChargedAmount -= data.amount
    this.sumChargedAmountByPeriod -= data.amount
    return this
  }

  public pay(data: Omit<PoolFeeData, 'amount'> & Required<Pick<PoolFeeData, 'amount'>>) {
    if(!this.isActive) throw new Error('Unable to uncharge inactive PolFee')
    this.sumChargedAmount -= data.amount
    this.sumChargedAmountByPeriod -= data.amount
    return this
  }
}
