import { AccountService } from './accountService'

test('Account is created in database', async () => {
  const id = 'ABCDE'
  const chainId = '2030'
  const account = await AccountService.init(id)
  await account.save()

  expect(logger.info).toHaveBeenCalled()
  expect(store.set).toHaveBeenCalledWith('Account', id, { id, chainId })
})
