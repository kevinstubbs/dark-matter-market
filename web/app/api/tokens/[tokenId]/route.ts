import { NextRequest, NextResponse } from 'next/server';

interface TokenInfo {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  treasury_account_id: string;
  admin_key: any;
  kyc_key: any;
  freeze_key: any;
  wipe_key: any;
  supply_key: any;
  fee_schedule_key: any;
  pause_key: any;
  auto_renew_account: string | null;
  auto_renew_period: number | null;
  expiry_timestamp: string | null;
  memo: string;
  created_timestamp: string;
  modified_timestamp: string;
  metadata_key: any;
  metadata: any;
  type: string;
  supply_type: string;
  max_supply: string;
  custom_fees: any;
  pause_status: string;
  ledger_id: string;
}

interface TokenInfoResponse {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  type: string;
  created_timestamp: string;
}

/**
 * Get token info from Hedera mirror node API
 * This endpoint is cacheable and will return token information
 * 
 * Query parameters:
 * - chainId: Optional chain ID (295 for mainnet, 296 for testnet, 298 for localhost). Defaults to testnet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { tokenId } = await params;
    const { searchParams } = new URL(request.url);
    const chainId = searchParams.get('chainId');
    
    if (!tokenId) {
      return NextResponse.json(
        { error: 'Token ID is required' },
        { status: 400 }
      );
    }

    // Determine network from chainId or use testnet as default
    // Chain ID 295 = mainnet, 296 = testnet, 298 = localhost
    let mirrorNodeUrl: string;
    if (chainId === '298') {
      mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL || 'http://localhost:5551';
    } else {
      const isMainnet = chainId === '295';
      mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL || 
        (isMainnet 
          ? 'https://mainnet-public.mirrornode.hedera.com'
          : 'https://testnet.mirrornode.hedera.com');
    }
    
    console.log(`Fetching token info from ${mirrorNodeUrl}/api/v1/tokens/${tokenId}`), chainId;
    const response = await fetch(
      `${mirrorNodeUrl}/api/v1/tokens/${tokenId}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        // Cache the fetch for 5 minutes
        next: { revalidate: 300 }
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Token not found' },
          { status: 404 }
        );
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: TokenInfo = await response.json();

    // Transform the response to include only relevant fields
    const tokenInfo: TokenInfoResponse = {
      token_id: data.token_id,
      name: data.name || 'Unknown',
      symbol: data.symbol || 'UNKNOWN',
      decimals: data.decimals || 0,
      total_supply: data.total_supply || '0',
      type: data.type || 'FUNGIBLE_COMMON',
      created_timestamp: data.created_timestamp,
    };

    return NextResponse.json(tokenInfo, {
      headers: {
        // Cache the response for 5 minutes
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching token info:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch token info',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

