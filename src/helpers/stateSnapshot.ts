import { SubstrateBlock } from '@subql/types'
import { errorHandler } from './errorHandler'
import { getPeriodStart } from './timekeeperService'

interface Constructor<C> {
  new (id: string): C
  //getByType(type: string): C[] | undefined
}

interface GenericState {
  id: string
  save(): Promise<void>
}

interface GenericSnapshot {
  id: string
  timestamp: Date
  blockNumber: number
  periodStart: Date
  save(): Promise<void>
}

/**
 * Creates a snapshot of a generic stateModel to a snapshotModel.
 * A snapshotModel has the same fields as the originating stateModel, however a timestamp and a blockNumber are added.
 * Fields ending with an _ underscore are reset to 0 at the end of a period. All such resettable fields must be of type
 * BigInt.
 * @param stateModel - the data model to be snapshotted
 * @param snapshotModel - the data model where the snapshot is saved. (must have additional timestamp and
 * blockNumber fields)
 * @param block - the correspondint substrateBlock to provide additional state values to the snapshot
 * @param fkReferenceName - (optional) name of the foreignKey to save a reference to the originating entity.
 * @returns A promise resolving when all state manipulations in the DB is completed
 */
export const stateSnapshotter = errorHandler(_stateSnapshotter)
async function _stateSnapshotter<T extends Constructor<GenericState>, U extends Constructor<GenericSnapshot>>(
  stateModel: T,
  snapshotModel: U,
  block: SubstrateBlock,
  fkReferenceName: string = undefined,
  filterKey = 'Type',
  filterValue = 'ALL'
): Promise<void> {
  const entitySaves: Promise<void>[] = []
  const getterName = `getBy${filterKey}`
  const stateModelHasGetByType = Object.prototype.hasOwnProperty.call(stateModel, getterName)
  if (!stateModelHasGetByType) throw new Error(`${stateModel.name} has no method .${getterName}()`)
  logger.info(`Performing snapshots of ${stateModel.name}`)
  const stateEntities = await stateModel[getterName](filterValue)
  for (const stateEntity of stateEntities) {
    const blockNumber = block.block.header.number.toNumber()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, [filterKey.toLowerCase()]: type, ...copyStateEntity } = stateEntity
    logger.info(`Snapshotting ${stateModel.name}: ${id}`)
    const snapshotEntity = new snapshotModel(`${id}-${blockNumber.toString()}`)
    Object.assign(snapshotEntity, copyStateEntity)
    snapshotEntity.timestamp = block.timestamp
    snapshotEntity.blockNumber = blockNumber
    snapshotEntity.periodStart = getPeriodStart(block.timestamp)

    if (fkReferenceName) snapshotEntity[fkReferenceName] = stateEntity.id

    const propNames = Object.getOwnPropertyNames(stateEntity)
    const propNamesToReset = propNames.filter((propName) => propName.endsWith('_'))
    for (const propName of propNamesToReset) {
      stateEntity[propName] = BigInt(0)
    }
    entitySaves.push(stateEntity.save())
    entitySaves.push(snapshotEntity.save())
  }
  await Promise.all(entitySaves)
}
