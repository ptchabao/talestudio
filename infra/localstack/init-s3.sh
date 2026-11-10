#!/bin/sh
set -e
awslocal s3api create-bucket --bucket talestudio >/dev/null 2>&1 || true
awslocal s3api put-bucket-lifecycle-configuration --bucket talestudio --lifecycle-configuration '{
  "Rules": [
    {"ID": "raw-7d",  "Status": "Enabled", "Filter": {"And": {"Prefix": "raw/", "Tags": [{"Key": "retention", "Value": "7"}]}},  "Expiration": {"Days": 7}},
    {"ID": "raw-14d", "Status": "Enabled", "Filter": {"And": {"Prefix": "raw/", "Tags": [{"Key": "retention", "Value": "14"}]}}, "Expiration": {"Days": 14}}
  ]
}'
awslocal s3api put-bucket-cors --bucket talestudio --cors-configuration '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD","PUT"],"AllowedHeaders":["*"]}]}'
echo "talestudio bucket ready"
