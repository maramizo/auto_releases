const core = require('@actions/core')
const github = require('@actions/github')

async function run(){
    const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
    const octokit = github.getOctokit(GITHUB_TOKEN);

    const { context = {} } = github;
    const { pull_request } = context.payload;

    if(!pull_request) {
        core.setFailed('This action only works on pull requests');
    }

    if(!pull_request.merged) {
        core.setFailed('This action only works on merged pull requests');
    }

    // Check if pull request's commits contain a commit with a message that starts with 'release:'
    const commits = await octokit.rest.pulls.listCommits({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pull_request.number
    });

    const releaseCommit = commits.data.find(commit => commit.commit.message.includes('release:'));
    if(!releaseCommit) {
        core.setFailed('This action only works on pull requests with a commit that starts with "release:"');
    }
    const regex = /release:(.*)/;
    const releaseName = regex.exec(releaseCommit.commit.message)[1];

    // Generate release notes
    const releaseNotes = await octokit.rest.repos.generateReleaseNotes({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: releaseName,
    });

    console.dir(releaseNotes)

    // Create a new release
    const release = await octokit.rest.repos.createRelease({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: releaseName,
        name: `Release ${releaseName}`,
        body: releaseNotes
    });

    // Add the release to the pull request
    await octokit.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pull_request.number,
        labels: [`Release ${releaseName}`]
    });

    // Get release link
    const releaseLink = `
        <a href="${release.data.html_url}">
            ${release.data.tag_name}
        </a>
    `;

    // Update the pull request with the release link
    await octokit.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pull_request.number,
        body: `${pull_request.body}
        ${releaseLink}`
    });
}

run().then();