export function getHashscanUrl(topicId: string, chainId: number): string {
  const network = chainId === 295 ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

export function getHashscanTokenUrl(tokenId: string, chainId: number): string {
  const network = chainId === 295 ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${network}/token/${tokenId}`;
}
