// Unit suites use explicit fetch mocks. Never let an async cleanup or a missing
// mock send analytics or customer responses to the SDK's default API endpoint.
globalThis.fetch = async () => { throw new Error('Unit-test HTTP requires an explicit fetch mock.'); };
