export function getHashscanUrl(topicId: string, chainId: number): string {
  if (chainId === 298) {
    // Localhost - no hashscan URL available
    return `#`;
  }
  const network = chainId === 295 ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

export function getHashscanTokenUrl(tokenId: string, chainId: number): string {
  if (chainId === 298) {
    // Localhost - no hashscan URL available
    return `#`;
  }
  const network = chainId === 295 ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${network}/token/${tokenId}`;
}
