const core = require('@actions/core')
const github = require('@actions/github')

async function run(){
    const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
    const octokit = github.getOctokit(GITHUB_TOKEN);

    const { context = {} } = github;
    const { pull_request } = context.payload;

    if(pull_request.base.ref !== 'master'){
        console.dir('Releases are only made from master');
        return;
    }

    if(!pull_request) {
        console.log('This action only works on pull requests');
        return;
    }

    if(!pull_request.merged) {
        console.log('This action only works on merged pull requests');
        return;
    }

    // Check if pull request's commits contain a commit with a message that starts with 'release:'
    const commits = await octokit.rest.pulls.listCommits({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pull_request.number
    });

    const releaseCommit = commits.data.find(commit => (commit.commit.message + '\n' + commit.commit.description).includes('release:'));
    if(!releaseCommit) {
        console.log('This action only works on pull requests with a commit that starts with "release:"');
        return;
    }
    const regex = /release:(.*)/;
    const releaseName = regex.exec(releaseCommit.commit.message + '\n' + releaseCommit.commit.description)[1];

    // Generate release notes
    const releaseNotes = await octokit.rest.repos.generateReleaseNotes({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: releaseName,
    });

    // Check if release already exists
    const releases = await octokit.rest.repos.listReleases({
        owner: context.repo.owner,
        repo: context.repo.repo,
    });

    // Check for and delete existing release
    const existingRelease = releases.data.find(release => release.tag_name === releaseName);
    if(existingRelease) {
        await octokit.rest.repos.deleteRelease({
            owner: context.repo.owner,
            repo: context.repo.repo,
            release_id: existingRelease.id,
        });

        // delete existing tag
        await octokit.rest.git.deleteRef({
            owner: context.repo.owner,
            repo: context.repo.repo,
            ref: `tags/${releaseName}`,
        });
    }

    // Create a new release
    const release = await octokit.rest.repos.createRelease({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: releaseName,
        name: `Release ${releaseName}`,
        body: pull_request.body ? `${pull_request.body}\n\n${releaseNotes.data.body}` : releaseNotes.data.body,
        sha: context.sha,
    });

    // Add the release to the pull request
    await octokit.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pull_request.number,
        labels: [`Release ${releaseName}`]
    });

    // Get release link
    const releaseLink = `<a href="${release.data.html_url}">${release.data.tag_name}</a>`;

    // Create new comment with release link
    await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pull_request.number,
        body: `<h2><details><summary>Release</summary>${releaseLink}</details></h2>`
    });
}

run().then();