#!/bin/bash

for i in `ls src`; do
  make project=$i
done