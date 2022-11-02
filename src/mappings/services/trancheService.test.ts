import { errorLogger } from '../../helpers/errorHandler'
import { ExtendedRpc } from '../../helpers/types'
import { TrancheService } from './trancheService'

api.query['ormlTokens'] = {
  totalIssuance: jest.fn(() => ({ toBigInt: () => BigInt('9999000000000000000000') })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

api.rpc['pools'] = {
  trancheTokenPrices: jest.fn(() => [
    { toBigInt: () => BigInt('2000000000000000000') },
    { toBigInt: () => BigInt('0') },
  ]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const poolId = '4355663',
  trancheIds = ['0x855f5572a85a957c48ef266a3f240ea0', '0x855f5572a85a957c48ef266a3f240ea1']

const trancheDataResidual = { trancheType: { isResidual: true }, seniority: { toNumber: () => 0 } }
const trancheDataNonResidual = {
  trancheType: {
    isResidual: false,
    asNonResidual: {
      interestRatePerSec: { toBigInt: () => BigInt('34000000000000') },
      minRiskBuffer: { toBigInt: () => BigInt('22000000000000') },
    },
  },
  seniority: { toNumber: () => 1 },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trancheData = [trancheDataResidual, trancheDataNonResidual] as any

const tranches = trancheIds.map((trancheId, i) =>
  TrancheService.init(poolId, trancheId, i, trancheData[Number(i !== 0)])
)

describe('Given a new tranche, when initialised', () => {
  test('then type is set to "ALL"', () => {
    expect(tranches[0].type).toBe('ALL')
    expect(tranches[1].type).toBe('ALL')
  })

  test('then reset accumulators are set to 0', () => {
    const resetAccumulators = Object.getOwnPropertyNames(tranches[0]).filter((prop) => prop.endsWith('_'))
    for (const resetAccumulator of resetAccumulators) {
      expect(tranches[0][resetAccumulator]).toBe(BigInt(0))
      expect(tranches[1][resetAccumulator]).toBe(BigInt(0))
    }
  })

  test('when the supply data is fetched, then the correct values are fetched and set', async () => {
    await tranches[0].updateSupply()
    expect(api.query.ormlTokens.totalIssuance).toBeCalledWith({ Tranche: [poolId, trancheIds[0]] })
    expect(tranches[0]).toMatchObject({ supply: BigInt('9999000000000000000000') })
  })

  test('then it can be saved to the database', async () => {
    await tranches[0].save()
    expect(store.set).toHaveBeenCalledWith('Tranche', `${poolId}-${trancheIds[0]}`, expect.anything())
  })
})

describe('Given an existing tranche,', () => {
  test('when the rpc price is updated, then the value is fetched and set correctly', async () => {
    await tranches[0].updatePriceFromRpc().catch(errorLogger)
    expect((api.rpc as ExtendedRpc).pools.trancheTokenPrices).toBeCalled()
    expect(tranches[0].price).toBe(BigInt('2000000000000000000'))
  })

  test('when a 0 rpc price is delivered, then the value is skipped and logged', async () => {
    await tranches[1].updatePriceFromRpc().catch(errorLogger)
    expect((api.rpc as ExtendedRpc).pools.trancheTokenPrices).toBeCalled()
    expect(logger.error).toBeCalled()
    expect(tranches[1].price).toBe(BigInt('1000000000000000000'))
  })
})
