import { errorHandler } from '../../helpers/errorHandler'
import { Epoch } from '../../types'

export class EpochService {
  epoch: Epoch | null

  constructor() {
    this.epoch = null
  }

  init = async (poolId: string, epochId: number, timestamp: Date) => {
    this.epoch = new Epoch(`${poolId}-${epochId.toString()}`)

    this.epoch.index = epochId
    this.epoch.poolId = poolId

    this.epoch.openedAt = timestamp
    await this.epoch.save()

    return this
  }

  getById = async (epochId: string) => {
    this.epoch = await Epoch.get(epochId)
    return this
  }

  save = () => {
    return this.epoch.save()
  }

  public closeEpoch = (timestamp: Date) => {
    this.epoch.closedAt = timestamp
  }

  public executeEpoch = (timestamp: Date) => {
    this.epoch.executedAt = timestamp
  }
}
