/**
 * Fetch the topic ID for the latest localnet proposal from the website
 * @param websiteUrl The base URL of the website (defaults to http://localhost:3001)
 * @returns The topic ID string, or null if not found
 */
export async function getLocalnetTopicId(websiteUrl: string = 'http://localhost:3001'): Promise<string | null> {
  try {
    const response = await fetch(`${websiteUrl}/api/topic-id/localnet`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('No localnet proposal found on website');
        return null;
      }
      throw new Error(`Failed to fetch topic ID: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as { topicId?: string };
    return data.topicId || null;
  } catch (error) {
    console.error(`Error fetching localnet topic ID from ${websiteUrl}:`, error);
    throw error;
  }
}

