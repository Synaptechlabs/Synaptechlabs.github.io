(() => {
  const versionLinks = document.querySelectorAll('.site-version');
  if (!versionLinks.length) return;

  fetch('https://api.github.com/repos/Synaptechlabs/Synaptechlabs.github.io/commits/main', {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then((response) => {
      if (!response.ok) throw new Error(`GitHub returned status ${response.status}`);
      return response.json();
    })
    .then(({ sha, html_url: commitUrl }) => {
      if (typeof sha !== 'string') throw new Error('GitHub response did not include a commit SHA');

      versionLinks.forEach((link) => {
        link.textContent = `latest push ${sha.slice(0, 7)}`;
        if (typeof commitUrl === 'string') link.href = commitUrl;
      });
    })
    .catch((error) => {
      console.warn('Could not load the latest site version:', error);
    });
})();
