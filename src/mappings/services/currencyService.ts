import { Option } from '@polkadot/types'
import { AssetMetadata } from '@polkadot/types/interfaces'
import { Currency } from '../../types/models/Currency'
import { WAD_DIGITS } from '../../config'
import { TokensCurrencyId } from 'centrifuge-subql/helpers/types'

export class CurrencyService extends Currency {
  static init(chainId: string, currencyId: string, decimals: number) {
    logger.info(`Initialising new currency ${currencyId} for chain ${chainId} with ${decimals} decimals`)
    const currency = new this(`${chainId}-${currencyId}`, chainId, decimals)
    return currency
  }

  static async getOrInit(chainId: string, currencyType: string, ...currencyValue: string[]) {
    const currencyId = currencyValue.length > 0 ? `${currencyType}-${currencyValue.join('-')}` : currencyType
    const id = `${chainId}-${currencyId}`
    let currency = await this.get(id)
    if (currency === undefined) {
      const assetMetadata = (await api.query.ormlAssetRegistry.metadata({
        [currencyType]: currencyId ?? null,
      })) as Option<AssetMetadata>
      let decimals: number
      if (assetMetadata.isSome) {
        decimals = assetMetadata.unwrap().decimals.toNumber()
      } else {
        decimals = WAD_DIGITS
      }
      currency = this.init(chainId, currencyId, decimals)
      await currency.save()
    }
    return currency as CurrencyService
  }
}

export const currencyFormatters: CurrencyFormatters = {
  AUSD: () => [],
  ForeignAsset: (value) => [value.toString(10)],
  Native: () => [],
  Staking: () => ['BlockRewards'],
  Tranche: (value) => [value[0].toString(10), value[1].toHex()],
}

type CurrencyFormatters = {
  [K in keyof TokensCurrencyId as K extends `as${infer R}` ? R : never]: (value: TokensCurrencyId[K]) => string[]
}
