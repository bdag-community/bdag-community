/** Approved community documents, 15 October 2026. These describe the planned Mainnet experience, not a live-launch announcement. */
export const COMMUNITY_GUIDES = [
  {
    "slug": "staking-and-dao",
    "title": "Staking V2 and DAO community guide",
    "description": "What to expect from the Staking and Development platforms, the phased roadmap, and answers to common questions.",
    "theme": "community",
    "reading": [
      {
        "heading": "What to expect on Mainnet",
        "paragraphs": [
          "We are building Staking V2 and a community DAO to give BDAG participants a clearer way to earn rewards, propose improvements and help decide the chain's direction. A DAO is a shared decision-making system with published rules and verifiable votes.",
          "When the production platforms launch, the Staking platform will manage your staking journey, while the Development platform will bring community ideas, voting and developer contributions together. Both will use the existing BlockDAG Mainnet, chain ID 1404."
        ]
      },
      {
        "heading": "Staking V2 and the Staking platform",
        "paragraphs": []
      },
      {
        "heading": "Choose your pool and stake your BDAG",
        "paragraphs": [
          "Connect your wallet, explore the available pools and choose where to stake. Your wallet will show each transaction for you to approve. Staking commits your BDAG to the V2 contract under the network's published rules; the website is your interface to that contract.",
          "Your first V2 stake begins a fresh initial bonding period of four weekly epochs, currently 28 days. An epoch is the network's accounting period: seven days on Mainnet. The platform will show your position and when withdrawal actions become available."
        ]
      },
      {
        "heading": "Follow rewards and manage withdrawals",
        "paragraphs": [
          "Your portfolio will show your pools, staked value, rewards, pending withdrawals and voting power. Pool rewards are reflected in the value of your staking position. To take out principal or earned rewards, request an unstake, complete the unbonding period, then claim the released BDAG to your wallet. Unbonding simply means waiting for an unstake request to mature."
        ]
      },
      {
        "heading": "Move from legacy staking in your own time",
        "paragraphs": [
          "Legacy V1 will keep its existing contract address, and V2 will have a separate address on the same Mainnet. If you already stake in V1, use the platform to unstake, complete the existing waiting period and claim your BDAG, including rewards already earned. Existing balances and pending withdrawal rights will be preserved.",
          "You can then choose a pool and stake those funds in V2. This is a new stake with a fresh bonding period, not an automatic transfer. The platform will direct new staking to V2, where future staking rewards and new staking voting power will be earned. V2 will be governed through the DAO's published approval and execution rules."
        ]
      },
      {
        "heading": "Turn earned rewards into a voice",
        "paragraphs": [
          "Eligible staking rewards from one week provide staking voting power for the next week. Eligible mining rewards provide mining voting power in the same way. Your wallet balance and deposited principal do not create voting power by themselves.",
          "Earn 100 BDAG in eligible rewards in Week 1 and use 100 units of voting power in Week 2. These non-transferable rights expire after Week 2; your BDAG is unaffected. Voting eligibility is automatic; token receipts are optional. You can vote on different proposals or delegate your vote without moving funds."
        ]
      },
      {
        "heading": "DAO and the Development platform",
        "paragraphs": []
      },
      {
        "heading": "Explore ideas and propose improvements",
        "paragraphs": [
          "You will be able to browse proposals, discussions and delivery evidence without connecting a wallet. Connect and sign in when you want to submit an idea, vote or register as a developer or team. A proposal should explain the change, why it matters and what a successful result would look like."
        ]
      },
      {
        "heading": "Vote through the relevant community",
        "paragraphs": [
          "Staking proposals use eligible staker votes; mining proposals use eligible miner or pool votes. CORE proposals, which affect the wider chain, involve both groups. Their results combine 70% mining support and 30% staking support, with each group meeting its own participation and support requirements.",
          "The platform will show the proposal, voting window, your available power and the result. Voting power follows eligible rewards from the previous complete epoch, so participation reflects contribution to the network. A replacement ballot updates your choice rather than counting twice."
        ]
      },
      {
        "heading": "Contribute and follow the work",
        "paragraphs": [
          "Developers and teams can register, go through the approval process and offer to work on community priorities. In Phase 1, vetted contributors will receive the private code access needed for their assigned work. Members will be able to follow proposed work, developer bids and progress evidence through the platform.",
          "Approved changes will go through development, code review and testing before entering a verified release. Node operators and miners then review and install the release under the network's upgrade rules. For supported on-chain actions, approval is followed by the required waiting period and execution. A vote does not automatically write code or install software."
        ]
      },
      {
        "heading": "A phased path to broader participation",
        "paragraphs": [
          "Phase 1 introduces Staking V2, legacy withdrawals, reward-based voting, community proposals and approved developer participation. Staking will open first so participants can establish positions and see their voting power before the DAO's proposal and voting process opens.",
          "Phase 2 expands open-source access, refines voting and introduces a community funding process with published approval and delivery terms.",
          "Phase 3 connects more of the proposal, funding, development and release process through on-chain rules, increasing automation and reducing dependence on individual coordinators.",
          "Anyone can continue building applications on BlockDAG without DAO permission. The official contribution and release process gives the community a structured way to shape the chain itself. This guide describes the intended Mainnet experience; final launch details will be published with the release."
        ]
      },
      {
        "heading": "Frequently asked questions",
        "paragraphs": []
      },
      {
        "heading": "Staking V2",
        "paragraphs": [
          "Can I get my BDAG back if my mining pool goes offline?",
          "Yes. Your BDAG is held in the staking contract, not the pool's wallet. You can unstake, complete the normal waiting periods and claim without the operator's approval. Pool downtime can affect future rewards, but does not itself remove your stake or withdrawal rights.",
          "Can I withdraw immediately?",
          "Your first V2 stake has a fresh four-epoch bonding period, currently 28 days. Unstake requests also have an unbonding period. The platform shows when you can claim.",
          "Will my legacy stake move into V2 automatically?",
          "No. Unstake from V1, complete its existing wait and claim to your wallet. Then choose a pool and stake in V2 with fresh bonding.",
          "Do I need a new wallet or another network?",
          "No. You can use the same wallet for V1 and V2 on BlockDAG Mainnet, chain ID 1404. They use separate contract addresses.",
          "How are rewards determined and withdrawn?",
          "Rewards follow network and pool rules and the pool's mining activity, rather than a fixed promised return. Rewards grow your staking position; withdraw the chosen amount through unstake, unbond and claim."
        ]
      },
      {
        "heading": "DAO and voting",
        "paragraphs": [
          "How do I get voting power?",
          "Eligible rewards earned in one complete weekly epoch provide voting power in the next. Holding BDAG or depositing principal alone does not create votes.",
          "Are voting tokens extra BDAG that I can sell?",
          "No. They are non-transferable voting rights, not spendable BDAG. They expire after their voting epoch; your earned BDAG is unaffected.",
          "Must I claim a token receipt before voting?",
          "No. Voting eligibility is available automatically. Claiming a visible receipt is optional and does not add voting power.",
          "Who votes on each type of proposal?",
          "Stakers vote on staking changes; miners or pools vote on mining changes. CORE decisions combine 70% mining and 30% staking support, with separate participation and support requirements.",
          "Can I delegate my vote without giving away my funds?",
          "Yes. Delegation gives someone voting authority under the epoch rules, not access to withdraw your BDAG.",
          "Can community members propose ideas or help develop them?",
          "Yes. Connect your wallet to submit a proposal or register as a developer or team. Contributions follow the review process; vetted contributors receive the required code access in Phase 1.",
          "Does an approved vote automatically upgrade the network?",
          "No. Software changes still need development, review, testing and operator adoption. Supported contract actions follow the required on-chain approval, waiting period and execution rules.\n"
        ]
      }
    ],
    "pages": [
      {
        "src": "/guides/assets/community-guide-1.webp",
        "alt": "Community guide, page 1 of 3. The full text is available in the reading view below.",
        "width": 1414,
        "height": 2000
      },
      {
        "src": "/guides/assets/community-guide-2.webp",
        "alt": "Community guide, page 2 of 3. The full text is available in the reading view below.",
        "width": 1414,
        "height": 2000
      },
      {
        "src": "/guides/assets/community-guide-3.webp",
        "alt": "Community guide, page 3 of 3. The full text is available in the reading view below.",
        "width": 1414,
        "height": 2000
      }
    ],
    "pdf": "/guides/assets/BDAG-Staking-V2-and-DAO-Community-Guide.pdf",
    "sha256": "b7b44ac0ee488291f7ae37ecb8a00849c0713dd69c05074b61424bc72d989b35"
  },
  {
    "slug": "staking-v2",
    "title": "Staking V2 and the Staking platform",
    "description": "Choose your pool, stake your BDAG, follow rewards, use your voting power and manage withdrawals.",
    "theme": "staking",
    "pages": [
      {
        "src": "/guides/assets/staking-v2.webp",
        "alt": "Staking V2 journey: legacy withdrawals or available BDAG, then choose a pool, stake, earn, vote and withdraw. Full steps below.",
        "width": 2400,
        "height": 3307
      }
    ],
    "reading": [
      {
        "heading": "One Mainnet, two contracts",
        "paragraphs": [
          "Connect your wallet on the existing BlockDAG Mainnet, chain ID 1404. Use available BDAG, or unstake from legacy V1, complete its existing unbonding period and claim. V1 and V2 use separate addresses. You choose when to restake."
        ]
      },
      {
        "heading": "Choose a pool and stake in V2",
        "paragraphs": [
          "Approve the stake in your wallet. Your first V2 stake begins a fresh four-epoch bonding period: 28 days on Mainnet."
        ]
      },
      {
        "heading": "Earn and follow",
        "paragraphs": [
          "Track pools, rewards and staking value in your portfolio. Pool rewards grow your position."
        ]
      },
      {
        "heading": "Use your voice",
        "paragraphs": [
          "Eligible V2 rewards provide voting power for the next epoch. Earn eligible rewards in Week 1, use the resulting votes in Week 2, then receive fresh power from Week 2 in Week 3. Votes expire each epoch; earned BDAG stays yours. Token receipts are optional."
        ]
      },
      {
        "heading": "Withdraw when ready",
        "paragraphs": [
          "Request unstake, complete unbonding and claim to your wallet. The platform shows when principal or rewards are ready to claim."
        ]
      }
    ],
    "pdf": "/guides/assets/Staking-V2-Community-Journey.pdf",
    "sha256": "f23bb0b4b3fe1ec1afacff3cfcf4bfce573591a9a93f1534d9c4a00de4cfb909"
  },
  {
    "slug": "dao-and-development",
    "title": "DAO and the Development platform",
    "description": "How community ideas move through discussion, voting, development, testing and network adoption.",
    "theme": "development",
    "pages": [
      {
        "src": "/guides/assets/dao-development.webp",
        "alt": "DAO and Development journey: propose, discuss, vote, build, review and test, then release and adopt. Full steps below.",
        "width": 2400,
        "height": 3307
      }
    ],
    "reading": [
      {
        "heading": "Explore, propose and discuss",
        "paragraphs": [
          "Browse freely. Connect your wallet to submit a clear improvement idea. Explain the scope and outcome, then let the community review the proposal."
        ]
      },
      {
        "heading": "Vote with earned participation",
        "paragraphs": [
          "The previous complete weekly epoch’s eligible rewards provide this epoch’s votes. CORE decisions combine 70% Mining and 30% Staking, with each group meeting its own voting rules. Staking-only changes go to stakers; mining-only changes go to miners."
        ]
      },
      {
        "heading": "Build, review and test",
        "paragraphs": [
          "Approved developers and teams deliver the agreed work. Code and delivery evidence are checked before release."
        ]
      },
      {
        "heading": "Release and adopt",
        "paragraphs": [
          "Operators review and install the verified network release. Supported on-chain actions follow approval, the required waiting period and execution. Software changes still need development, testing and operator adoption."
        ]
      },
      {
        "heading": "Built in phases",
        "paragraphs": [
          "Phase 1: Staking and governance. Phase 2: Open source and funding. Phase 3: More on-chain automation."
        ]
      }
    ],
    "pdf": "/guides/assets/DAO-Development-Community-Journey.pdf",
    "sha256": "66a0d4cb68f5fce48ec94b25f5571ebd7b64b9a458b84a7093b577581624802a"
  }
] as const;
