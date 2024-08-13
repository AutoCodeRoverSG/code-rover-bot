#!/bin/bash

npm run build-ga

git add .
git commit -m "Update action"
git tag -a -m "Update action" v0.0.2
git push --follow-tags
