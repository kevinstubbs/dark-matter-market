import { getAllDMMsWithProposals, type DMMWithProposals } from "@/lib/db";
import ReactMarkdown from "react-markdown";
import { TokenInfo } from "@/app/components/TokenInfo";
import { getHashscanUrl } from "@/lib/utils";
import { DMMVotesChart } from "@/app/components/DMMVotesChart";
import { ProposalVoteChart } from "@/app/components/ProposalVoteChart";
import { TopicStats } from "@/app/components/TopicStats";
import { Header } from "./components/Header";

export default async function Home() {
  let dmms: DMMWithProposals[] = [];
  let error: string | null = null;

  try {
    dmms = await getAllDMMsWithProposals();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load DMMs';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col py-16 px-8 bg-white dark:bg-black">
        <Header />

        {error && (
          <div className="mb-8 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-red-800 dark:text-red-200">Error: {error}</p>
          </div>
        )}

        {dmms.length === 0 && !error ? (
          <div className="text-center py-16">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              No DMMs found. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {dmms.map((dmm) => {
              const hashscanUrl = getHashscanUrl(dmm.topic_id, dmm.chain_id);
              const network = dmm.chain_id === 295 ? 'Mainnet' : dmm.chain_id === 298 ? 'Localhost' : 'Testnet';

              return (
                <div
                  key={dmm.id}
                  className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
                      {dmm.name}
                    </h2>
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {network}
                    </span>
                  </div>

                  {dmm.description && (
                    <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                      {dmm.description}
                    </p>
                  )}

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Topic ID:
                      </span>
                      <a
                        href={hashscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <code>{dmm.topic_id}</code>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                    <TokenInfo tokenId={dmm.token_id} chainId={dmm.chain_id} />
                    <div className="text-sm text-zinc-500 dark:text-zinc-500">
                      Created: {new Date(dmm.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Topic Stats and Chart */}
                  <TopicStats topicId={dmm.topic_id} />

                  {dmm.proposals.length > 0 && (
                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                      <h3 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">
                        Proposals ({dmm.proposals.length})
                      </h3>
                      <div className="space-y-4">
                        {dmm.proposals.map((proposal) => {
                          const deadline = new Date(proposal.voting_deadline);
                          const isExpired = deadline < new Date();
                          const statusColors = {
                            active: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',
                            passed: 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
                            failed: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
                            expired: 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-800',
                          };

                          return (
                            <div
                              key={proposal.id}
                              className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <h4 className="text-lg font-semibold text-black dark:text-zinc-50">
                                  {proposal.name}
                                </h4>
                                <span className={`px-2 py-1 text-xs font-medium rounded border ${statusColors[proposal.status] || statusColors.expired}`}>
                                  {proposal.status}
                                </span>
                              </div>

                              <div className="prose prose-sm dark:prose-invert max-w-none mb-4 text-zinc-700 dark:text-zinc-300">
                                <ReactMarkdown>
                                  {proposal.description}
                                </ReactMarkdown>
                              </div>

                              <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                                <div>
                                  <span className="font-medium">Quorum:</span>{' '}
                                  {parseInt(proposal.quorum).toLocaleString()}
                                </div>
                                <div>
                                  <span className="font-medium">Deadline:</span>{' '}
                                  {deadline.toLocaleString()}
                                  {isExpired && (
                                    <span className="ml-2 text-red-600 dark:text-red-400">(Expired)</span>
                                  )}
                                </div>
                              </div>

                              {/* Vote Distribution Chart */}
                              <ProposalVoteChart proposalId={proposal.id} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
