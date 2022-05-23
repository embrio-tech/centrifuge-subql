import { SubstrateBlock } from '@subql/types'
import { errorHandler } from './errorHandler'

interface Constructor<C> {
  new (id: string): C
}

interface TypeGetter<C> {
  getByType(type: string): Promise<C[]> | undefined
}

interface GenericState {
  id: string
  type: string
  save(): Promise<void>
}

interface GenericSnapshot {
  id: string
  timestamp: Date
  blockHeight: number
  save(): Promise<void>
}

export const stateSnapshotter = errorHandler(_stateSnapshotter)
async function _stateSnapshotter<
  T extends Constructor<GenericState> & TypeGetter<GenericState>,
  U extends Constructor<GenericSnapshot>
>(
  stateModel: T,
  snapshotModel: U,
  block: SubstrateBlock,
  fkReferenceName: string = undefined
): Promise<Promise<void>[]> {
  let entitySaves = []
  if (!stateModel.hasOwnProperty('getByType')) throw new Error('stateModel has no method .hasOwnProperty()')
  const stateEntities = await stateModel.getByType('ALL')
  stateEntities.map((stateEntity) => {
    const blockHeight = block.block.header.number.toNumber()
    const { id, type, ...copyStateEntity } = stateEntity
    const snapshotEntity = new snapshotModel(`${id}-${blockHeight.toString()}`)
    Object.assign(snapshotEntity, copyStateEntity)
    snapshotEntity.timestamp = block.timestamp
    snapshotEntity.blockHeight = blockHeight

    if (fkReferenceName) snapshotEntity[fkReferenceName] = stateEntity.id

    const propNamesToReset = Object.getOwnPropertyNames(stateEntity).filter((propName) => propName.endsWith('_'))
    for (const propName of propNamesToReset) {
      logger.info(`Resetting entity: ${propName}`)
      stateEntity[propName] = BigInt(0)
    }

    entitySaves.push(stateEntity.save())
    entitySaves.push(snapshotEntity.save())
  })
  return Promise.all(entitySaves)
}
