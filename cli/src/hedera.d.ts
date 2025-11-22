export interface TopicMessage {
    consensus_timestamp: string;
    message: string;
    running_hash: string;
    sequence_number: number;
    topic_id: string;
    chunk_info?: {
        initial_transaction_id: {
            account_id: string;
            nonce: number;
            scheduled: boolean;
            transaction_valid_start: string;
        };
        number: number;
        total: number;
    };
}
export interface TopicMessagesResponse {
    messages: TopicMessage[];
    links?: {
        next?: string;
    };
}
export declare function fetchTopicMessages(topicId: string, chainId: number): Promise<TopicMessage[]>;
//# sourceMappingURL=hedera.d.ts.map