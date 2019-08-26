#!/bin/bash

if [[ ! -z "${NPM_TOKEN}" ]]; then
  printf "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n" >> ~/.npmrc
fi