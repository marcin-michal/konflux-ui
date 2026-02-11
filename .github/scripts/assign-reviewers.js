/**
 * Automatically assigns reviewers to pull requests using a round-robin algorithm.
 * Designed to evenly distribute code review requests across team members.
 *
 * FEATURES:
 * - Round-robin rotation through a configurable reviewer pool
 * - Smart partial assignment: counts already-assigned pool reviewers and tops up to target
 * - Skips draft PRs and bot-authored PRs
 * - Supports dry-run mode (TEST_MODE / DRY_RUN) for testing without side effects
 * - Rotation state persisted via GitHub repository variable
 *
 * ENVIRONMENT VARIABLES:
 * - GITHUB_TOKEN: Required - GitHub API token (needs pull-requests:write and actions:write)
 * - PR_NUMBER: Required - PR number to process
 * - DRY_RUN / TEST_MODE: Optional - Set to 'true' to log without assigning
 * - GITHUB_REPOSITORY: Auto-set by GitHub Actions (owner/repo format)
 */

import { Octokit } from '@octokit/rest';
import { fileURLToPath } from 'node:url';

const REVIEWER_POOL = [
  'marcin-michal',
  'rrosatti',
  'janaki29',
  'sahil143',
  'testcara',
  'milantaky',
  'StanislavJochman',
  'JoaoPedroPP',
  'rakshett',
  'abhinandan13jan',
];

const REQUIRED_REVIEWERS = 2;
const BOT_AUTHORS = ['red-hat-konflux[bot]', 'dependabot[bot]'];
const ROTATION_VARIABLE_NAME = 'REVIEWER_ROTATION_INDEX';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.TEST_MODE === 'true';
const PR_NUMBER = process.env.PR_NUMBER ? parseInt(process.env.PR_NUMBER, 10) : null;
const [REPO_OWNER, REPO_NAME] = (process.env.GITHUB_REPOSITORY || 'konflux-ci/konflux-ui').split(
  '/',
);

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Picks the next N reviewers from the pool using round-robin.
 *
 * Starting from `currentIndex`, walks through the pool (wrapping around),
 * skips any usernames in `excludeSet` (case-insensitive), and selects
 * up to `count` eligible reviewers.
 *
 * @param {string[]} pool - Ordered array of GitHub usernames
 * @param {Set<string>} excludeSet - Lowercased usernames to skip (author, already assigned, PTO)
 * @param {number} currentIndex - Starting position in the pool
 * @param {number} count - Number of reviewers to pick
 * @returns {{ selected: string[], nextIndex: number }} Selected usernames and updated rotation index
 */
export const pickNextReviewers = (pool, excludeSet, currentIndex, count) => {
  if (pool.length === 0 || count <= 0) {
    return { selected: [], nextIndex: currentIndex };
  }

  const selected = [];
  let idx = currentIndex % pool.length;
  let checked = 0;

  while (selected.length < count && checked < pool.length) {
    const candidate = pool[idx];
    if (!excludeSet.has(candidate.toLowerCase())) {
      selected.push(candidate);
    }
    idx = (idx + 1) % pool.length;
    checked++;
  }

  return { selected, nextIndex: idx };
};

/**
 * Reads the current rotation index from the GitHub repository variable.
 * Returns 0 if the variable doesn't exist yet.
 *
 * @returns {Promise<number>} Current rotation index
 */
const getRotationIndex = async () => {
  try {
    const { data } = await octokit.actions.getRepoVariable({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      name: ROTATION_VARIABLE_NAME,
    });
    const index = parseInt(data.value, 10);
    return Number.isNaN(index) ? 0 : index;
  } catch (err) {
    if (err.status === 404) {
      console.log(`[INFO] Variable ${ROTATION_VARIABLE_NAME} not found, starting from 0`);
      return 0;
    }
    throw err;
  }
};

/**
 * Updates the rotation index in the GitHub repository variable.
 * Creates the variable if it doesn't exist yet.
 * No-op in dry-run mode.
 *
 * @param {number} newIndex - New rotation index to store
 */
const setRotationIndex = async (newIndex) => {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would update ${ROTATION_VARIABLE_NAME} to ${newIndex}`);
    return;
  }

  try {
    await octokit.actions.updateRepoVariable({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      name: ROTATION_VARIABLE_NAME,
      value: String(newIndex),
    });
    console.log(`Updated ${ROTATION_VARIABLE_NAME} to ${newIndex}`);
  } catch (err) {
    if (err.status === 404) {
      // Variable doesn't exist yet, create it
      await octokit.actions.createRepoVariable({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        name: ROTATION_VARIABLE_NAME,
        value: String(newIndex),
      });
      console.log(`Created ${ROTATION_VARIABLE_NAME} with value ${newIndex}`);
    } else {
      // Log warning but don't fail — reviewer assignment already succeeded
      console.warn(`[WARN] Failed to update rotation index: ${err.message}`);
      console.warn('[WARN] The rotation index may be stale on the next run.');
    }
  }
};

const assignReviewers = async () => {
  try {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is not set');
    }
    if (!PR_NUMBER) {
      throw new Error('PR_NUMBER is not set');
    }

    const { data: pr } = await octokit.pulls.get({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: PR_NUMBER,
    });

    const prAuthor = pr.user.login;
    console.log(`\n--- Processing PR #${PR_NUMBER} by ${prAuthor} ---`);
    console.log(`   Title: ${pr.title}`);

    if (pr.draft) {
      console.log('[SKIP] PR is a draft, skipping reviewer assignment.');
      return;
    }

    if (BOT_AUTHORS.some((bot) => bot.toLowerCase() === prAuthor.toLowerCase())) {
      console.log(`[SKIP] PR is by bot "${prAuthor}", skipping reviewer assignment.`);
      return;
    }

    const currentReviewers = (pr.requested_reviewers || []).map((u) => u.login);
    console.log(
      `Currently requested reviewers: ${currentReviewers.length ? currentReviewers.join(', ') : 'none'}`,
    );

    const poolReviewersAlreadyAssigned = currentReviewers.filter((reviewer) =>
      REVIEWER_POOL.some((poolMember) => poolMember.toLowerCase() === reviewer.toLowerCase()),
    );

    const needed = REQUIRED_REVIEWERS - poolReviewersAlreadyAssigned.length;
    console.log(
      `   Pool reviewers already assigned: ${poolReviewersAlreadyAssigned.length}` +
        (poolReviewersAlreadyAssigned.length
          ? ` (${poolReviewersAlreadyAssigned.join(', ')})`
          : ''),
    );
    console.log(`   Additional reviewers needed: ${needed}`);

    if (needed <= 0) {
      console.log('[OK] Enough pool reviewers already assigned, no action needed.');
      return;
    }

    const excludeSet = new Set([
      prAuthor.toLowerCase(),
      ...poolReviewersAlreadyAssigned.map((r) => r.toLowerCase()),
    ]);

    // TODO: add PTO filtering
    // const ptoMembers = await checkPTO();
    // ptoMembers.forEach((member) => excludeSet.add(member));

    const currentIndex = await getRotationIndex();
    console.log(`Current rotation index: ${currentIndex}`);

    const { selected, nextIndex } = pickNextReviewers(
      REVIEWER_POOL,
      excludeSet,
      currentIndex,
      needed,
    );

    console.log(`   Selected: ${selected.length ? selected.join(', ') : 'none'}`);
    console.log(`   Next rotation index: ${nextIndex}`);

    if (selected.length === 0) {
      console.warn('[WARN] No eligible reviewers found in the pool!');
      return;
    }

    if (selected.length < needed) {
      console.warn(
        `[WARN] Only found ${selected.length} eligible reviewer(s) out of ${needed} needed.`,
      );
    }

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would assign reviewer(s): ${selected.join(', ')} to PR #${PR_NUMBER}`);
    } else {
      await octokit.pulls.requestReviewers({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        pull_number: PR_NUMBER,
        reviewers: selected,
      });
      console.log(`[OK] Assigned reviewer(s): ${selected.join(', ')} to PR #${PR_NUMBER}`);
    }

    await setRotationIndex(nextIndex);
  } catch (err) {
    console.error('[ERROR] Error assigning reviewers:', err);
    process.exit(1);
  }
};

// Only run when executed directly (not when imported for testing)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assignReviewers();
}
