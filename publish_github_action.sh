#!/bin/bash

npm run build-ga

git add .
git commit -m "Update action"

git tag --delete v1.1.0
git push --delete origin v1.1.0

git tag -a -m "Update action" v1.1.0
git push --follow-tags
