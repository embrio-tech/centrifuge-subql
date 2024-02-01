import type { OverrideBundleDefinition } from '@polkadot/types/types'

/* eslint-disable sort-keys */

const definitions: OverrideBundleDefinition = {
  runtime: {
    LoansApi: [
      {
        methods: {
          portfolio: {
            description: 'Get active pool loan',
            params: [
              {
                name: 'pool_id',
                type: 'u64',
              },
            ],
            type: 'Vec<(u64, ActiveLoanInfo)>',
          },
          portfolio_loan: {
            description: 'Get active pool loan',
            params: [
              {
                name: 'pool_id',
                type: 'u64',
              },
              {
                name: 'loan_id',
                type: 'u64',
              },
            ],
            type: 'Option<PalletLoansEntitiesLoansActiveLoan>',
          },
        },
        version: 1,
      },
    ],
  },
  rpc: {
    pools: {
      trancheTokenPrices: {
        description: 'Retrieve prices for all tranches',
        params: [
          {
            name: 'poolId',
            type: 'u64',
            isOptional: false,
          },
          {
            name: 'at',
            type: 'BlockHash',
            isHistoric: true,
            isOptional: false,
          },
        ],
        type: 'Vec<u128>',
      },
      trancheTokenPrice: {
        description: 'Retrieve prices for a tranche',
        params: [
          {
            name: 'poolId',
            type: 'u64',
            isOptional: false,
          },
          {
            name: 'trancheId',
            type: '[u8;16]',
            isOptional: false,
          },
          {
            name: 'at',
            type: 'BlockHash',
            isHistoric: true,
            isOptional: false,
          },
        ],
        type: 'u128',
      },
    },
  },
}

export default {
  typesBundle: { spec: { 'centrifuge-devel': definitions, altair: definitions, centrifuge: definitions } },
}
