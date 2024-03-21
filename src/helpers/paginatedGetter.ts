import type { Entity, FieldsExpression } from '@subql/types-core'

export async function paginatedGetter<T extends Entity,>(
  entity: T['_name'],
  filter: FieldsExpression<T>[]
): Promise<T[]> {
  let results: T[] = []
  const batch = 100
  let amount = 0
  let entities: T[]
  do {
    entities = (await store.getByFields<T>(entity, filter, {
      offset: amount,
      limit: batch,
    }))
    results = results.concat(entities)
    amount += entities.length
  } while (entities.length > 0)
  return results
}
