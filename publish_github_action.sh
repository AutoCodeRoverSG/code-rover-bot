#!/bin/bash

npm run build-ga-new

git add .
git commit -m "Update action"

git tag --delete v0.0.2
git push --delete origin v0.0.2

git tag -a -m "Update action" v0.0.2
git push --follow-tags
