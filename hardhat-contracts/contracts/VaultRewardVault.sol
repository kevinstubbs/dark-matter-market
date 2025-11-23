// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title VaultRewardVault
 * @notice Allows buyers to deposit incentive money in escrow for proposals and outcomes.
 *         A trusted wallet can allocate rewards to users who voted for a particular outcome
 *         after verifying the proposal has completed.
 */
contract VaultRewardVault {
    address public trustedWallet;
    
    struct ProposalDeposit {
        uint256 totalDeposited;
        mapping(string => uint256) depositsByOutcome; // "yes", "no", "abstain"
        bool rewardsAllocated;
    }
    
    // proposalId => ProposalDeposit
    mapping(string => ProposalDeposit) public proposals;
    
    // proposalId => outcome => voter => amount
    mapping(string => mapping(string => mapping(address => uint256))) public rewards;
    
    event DepositMade(
        string indexed proposalId,
        string indexed outcome,
        address indexed depositor,
        uint256 amount
    );
    
    event RewardsAllocated(
        string indexed proposalId,
        string indexed outcome,
        address[] voters,
        uint256[] amounts
    );
    
    event TrustedWalletUpdated(address indexed oldWallet, address indexed newWallet);
    
    modifier onlyTrustedWallet() {
        require(msg.sender == trustedWallet, "Only trusted wallet can call this function");
        _;
    }
    
    constructor() {
        trustedWallet = msg.sender;
    }
    
    /**
     * @notice Deposit incentive money in escrow for a particular proposal and outcome
     * @param proposalId The unique identifier of the proposal
     * @param outcome The outcome being incentivized ("yes", "no", or "abstain")
     */
    function deposit(string calldata proposalId, string calldata outcome) external payable {
        require(msg.value > 0, "Deposit amount must be greater than 0");
        require(
            keccak256(bytes(outcome)) == keccak256(bytes("yes")) ||
            keccak256(bytes(outcome)) == keccak256(bytes("no")) ||
            keccak256(bytes(outcome)) == keccak256(bytes("abstain")),
            "Outcome must be yes, no, or abstain"
        );
        require(!proposals[proposalId].rewardsAllocated, "Rewards already allocated for this proposal");
        
        proposals[proposalId].totalDeposited += msg.value;
        proposals[proposalId].depositsByOutcome[outcome] += msg.value;
        
        emit DepositMade(proposalId, outcome, msg.sender, msg.value);
    }
    
    /**
     * @notice Allocate rewards to voters who voted for a particular outcome
     * @param proposalId The unique identifier of the proposal
     * @param outcome The outcome that was voted for ("yes", "no", or "abstain")
     * @param voters Array of addresses who voted for this outcome
     * @param voteWeights Array of vote weights for each voter (must match voters array length)
     * @param proposalCompleted Boolean indicating if the proposal has completed
     */
    function allocateRewards(
        string calldata proposalId,
        string calldata outcome,
        address[] calldata voters,
        uint256[] calldata voteWeights,
        bool proposalCompleted
    ) external onlyTrustedWallet {
        require(proposalCompleted, "Proposal must be completed");
        require(
            keccak256(bytes(outcome)) == keccak256(bytes("yes")) ||
            keccak256(bytes(outcome)) == keccak256(bytes("no")) ||
            keccak256(bytes(outcome)) == keccak256(bytes("abstain")),
            "Outcome must be yes, no, or abstain"
        );
        require(!proposals[proposalId].rewardsAllocated, "Rewards already allocated");
        require(voters.length == voteWeights.length, "Voters and voteWeights arrays must have same length");
        require(voters.length > 0, "Must have at least one voter");
        
        uint256 totalDeposit = proposals[proposalId].depositsByOutcome[outcome];
        require(totalDeposit > 0, "No deposits for this outcome");
        
        // Calculate total vote weight
        uint256 totalVoteWeight = 0;
        for (uint256 i = 0; i < voteWeights.length; i++) {
            totalVoteWeight += voteWeights[i];
        }
        require(totalVoteWeight > 0, "Total vote weight must be greater than 0");
        
        // Allocate rewards proportionally based on vote weights
        uint256[] memory rewardAmounts = new uint256[](voters.length);
        for (uint256 i = 0; i < voters.length; i++) {
            require(voters[i] != address(0), "Voter address cannot be zero");
            require(voteWeights[i] > 0, "Vote weight must be greater than 0");
            
            // Calculate proportional reward
            rewardAmounts[i] = (totalDeposit * voteWeights[i]) / totalVoteWeight;
            
            // Store reward for this voter
            rewards[proposalId][outcome][voters[i]] = rewardAmounts[i];
            
            // Transfer reward to voter
            (bool success, ) = voters[i].call{value: rewardAmounts[i]}("");
            require(success, "Transfer failed");
        }
        
        proposals[proposalId].rewardsAllocated = true;
        
        emit RewardsAllocated(proposalId, outcome, voters, rewardAmounts);
    }
    
    /**
     * @notice Update the trusted wallet address
     * @param newTrustedWallet The new trusted wallet address
     */
    function updateTrustedWallet(address newTrustedWallet) external onlyTrustedWallet {
        require(newTrustedWallet != address(0), "New trusted wallet cannot be zero address");
        address oldWallet = trustedWallet;
        trustedWallet = newTrustedWallet;
        emit TrustedWalletUpdated(oldWallet, newTrustedWallet);
    }
    
    /**
     * @notice Get the total deposit for a proposal
     * @param proposalId The unique identifier of the proposal
     * @return Total amount deposited for this proposal
     */
    function getTotalDeposit(string calldata proposalId) external view returns (uint256) {
        return proposals[proposalId].totalDeposited;
    }
    
    /**
     * @notice Get the deposit for a specific proposal and outcome
     * @param proposalId The unique identifier of the proposal
     * @param outcome The outcome ("yes", "no", or "abstain")
     * @return Amount deposited for this proposal and outcome
     */
    function getDepositByOutcome(string calldata proposalId, string calldata outcome) external view returns (uint256) {
        return proposals[proposalId].depositsByOutcome[outcome];
    }
    
    /**
     * @notice Get the reward amount for a specific voter
     * @param proposalId The unique identifier of the proposal
     * @param outcome The outcome ("yes", "no", or "abstain")
     * @param voter The address of the voter
     * @return Reward amount for this voter
     */
    function getReward(string calldata proposalId, string calldata outcome, address voter) external view returns (uint256) {
        return rewards[proposalId][outcome][voter];
    }
    
    /**
     * @notice Check if rewards have been allocated for a proposal
     * @param proposalId The unique identifier of the proposal
     * @return True if rewards have been allocated
     */
    function isRewardsAllocated(string calldata proposalId) external view returns (bool) {
        return proposals[proposalId].rewardsAllocated;
    }
    
    /**
     * @notice Receive function to allow direct ETH transfers
     */
    receive() external payable {
        revert("Use deposit() function to make deposits");
    }
    
    /**
     * @notice Fallback function
     */
    fallback() external payable {
        revert("Use deposit() function to make deposits");
    }
}

