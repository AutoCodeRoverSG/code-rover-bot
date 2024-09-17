#!/bin/bash

npm run build-ga

git add .
git commit -m "Update action"

git tag --delete v2.0.0
git push --delete origin v2.0.0

git tag -a -m "Update action" v2.0.0
git push --follow-tags
