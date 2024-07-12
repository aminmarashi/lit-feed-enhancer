/*
  Imported from TF state using the following commands
  $ terraform state pull > terraform.tfstate
  $ pulumi import --from terraform terraform.tfstate
*/
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const lambdaRunUser = new aws.iam.User(
  "lambda_run_user",
  { name: "lambda-run-user" },
  {
    protect: true,
  }
);
const lambdaUserAccessKey = new aws.iam.AccessKey(
  "lambda_user_access_key",
  {
    status: "Active",
    user: lambdaRunUser.id,
  },
  {
    protect: true,
  }
);
const feedEventsBucket = new aws.s3.BucketV2(
  "feed_events_bucket",
  {
    bucket: "lit-feed-dev-feed-events-bucket",
    grants: [
      {
        id: "af84821e7f22b2a9f90d6ec79dfe537c05e56f02d08875ada641428ededabfc4",
        permissions: ["FULL_CONTROL"],
        type: "CanonicalUser",
        uri: "",
      },
    ],
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionExpirations: [],
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        transitions: [
          {
            days: 365,
            storageClass: "GLACIER",
          },
          {
            days: 30,
            storageClass: "ONEZONE_IA",
          },
        ],
      },
    ],
    requestPayer: "BucketOwner",
    serverSideEncryptionConfigurations: [
      {
        rules: [
          {
            applyServerSideEncryptionByDefaults: [
              {
                kmsMasterKeyId: "",
                sseAlgorithm: "AES256",
              },
            ],
            bucketKeyEnabled: false,
          },
        ],
      },
    ],
    versionings: [
      {
        enabled: false,
        mfaDelete: false,
      },
    ],
  },
  {
    protect: true,
  }
);
const processArticleLambdaLogGroup = new aws.cloudwatch.LogGroup(
  "process_article_lambda_log_group",
  {
    logGroupClass: "STANDARD",
    name: "/aws/lambda/process-article",
    retentionInDays: 7,
  },
  {
    protect: true,
  }
);
const processArticle = new aws.lambda.Function(
  "process_article",
  {
    architectures: ["x86_64"],
    environment: {
      variables: {
        MONGO_URL: "/lit-feed/dev/mongo",
      },
    },
    ephemeralStorage: {
      size: 512,
    },
    handler: "index.handler",
    loggingConfig: {
      logFormat: "Text",
      logGroup: processArticleLambdaLogGroup.id,
    },
    memorySize: 512,
    name: "process-article",
    packageType: "Zip",
    role: "arn:aws:iam::058264093352:role/lambda-execution-role",
    runtime: aws.lambda.Runtime.NodeJS20dX,
    timeout: 30,
    tracingConfig: {
      mode: "PassThrough",
    },
    code: new pulumi.asset.AssetArchive({
      ".": new pulumi.asset.FileArchive("./dist/process-article"),
    }),
  },
  {
    protect: true,
  }
);
const invokeProcessArticlePolicy = new aws.iam.Policy(
  "invoke_process_article_policy",
  {
    description: "Allows calling the process-article Lambda function",
    name: "invoke-process-article-policy",
    policy: processArticle.arn.apply((arn) =>
      JSON.stringify({
        Statement: [
          {
            Action: "lambda:InvokeFunction",
            Effect: "Allow",
            Resource: arn,
          },
        ],
        Version: "2012-10-17",
      })
    ),
  },
  {
    protect: true,
    dependsOn: [processArticle],
  }
);
const syncFeedDatabaseLambdaLogGroup = new aws.cloudwatch.LogGroup(
  "sync_feed_database_lambda_log_group",
  {
    logGroupClass: "STANDARD",
    name: "/aws/lambda/sync-feed-database",
    retentionInDays: 7,
  },
  {
    protect: true,
  }
);
const lambdaExectutionRole = new aws.iam.Role(
  "lambda_execution_role",
  {
    assumeRolePolicy: JSON.stringify({
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
        },
      ],
      Version: "2012-10-17",
    }),
    inlinePolicies: [
      {
        name: "athena-all-permissions",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["athena:*"],
              Resource: "*",
            },
          ],
        }),
      },
      {
        name: "glue-all-permissions",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["glue:*"],
              Resource: "*",
            },
          ],
        }),
      },
      {
        name: "s3-all-permissions",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:*"],
              Resource: "*",
            },
          ],
        }),
      },
    ],
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess",
    ],
    name: "lambda-execution-role",
  },
  {
    protect: true,
  }
);
const syncFeedDatabase = new aws.lambda.Function(
  "sync_feed_database",
  {
    architectures: ["x86_64"],
    environment: {
      variables: {
        MONGO_URL: "/lit-feed/dev/mongo",
      },
    },
    ephemeralStorage: {
      size: 512,
    },
    handler: "index.handler",
    loggingConfig: {
      logFormat: "Text",
      logGroup: syncFeedDatabaseLambdaLogGroup.id,
    },
    name: "sync-feed-database",
    packageType: "Zip",
    role: lambdaExectutionRole.arn,
    runtime: aws.lambda.Runtime.NodeJS20dX,
    tracingConfig: {
      mode: "PassThrough",
    },
    code: new pulumi.asset.AssetArchive({
      ".": new pulumi.asset.FileArchive("./dist/sync-feed-database"),
    }),
  },
  {
    protect: true,
  }
);
const invokeSyncFeedDatabasePolicy = new aws.iam.Policy(
  "invoke_sync_feed_database_policy",
  {
    description: "Allows calling the sync-feed-database Lambda function",
    name: "invoke-sync-feed-database-policy",
    policy: syncFeedDatabase.arn.apply((arn) =>
      JSON.stringify({
        Statement: [
          {
            Action: "lambda:InvokeFunction",
            Effect: "Allow",
            Resource: arn,
          },
        ],
        Version: "2012-10-17",
      })
    ),
  },
  {
    protect: true,
    dependsOn: [syncFeedDatabase],
  }
);
const articleBucket = new aws.s3.BucketV2(
  "article_bucket",
  {
    bucket: "lit-feed-dev-article-bucket",
    grants: [
      {
        id: "af84821e7f22b2a9f90d6ec79dfe537c05e56f02d08875ada641428ededabfc4",
        permissions: ["FULL_CONTROL"],
        type: "CanonicalUser",
        uri: "",
      },
    ],
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionExpirations: [],
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        transitions: [
          {
            days: 365,
            storageClass: "GLACIER",
          },
          {
            days: 30,
            storageClass: "ONEZONE_IA",
          },
        ],
      },
    ],
    requestPayer: "BucketOwner",
    serverSideEncryptionConfigurations: [
      {
        rules: [
          {
            applyServerSideEncryptionByDefaults: [
              {
                kmsMasterKeyId: "",
                sseAlgorithm: "AES256",
              },
            ],
            bucketKeyEnabled: false,
          },
        ],
      },
    ],
    versionings: [
      {
        enabled: false,
        mfaDelete: false,
      },
    ],
  },
  {
    protect: true,
  }
);

const getArticleScore = new aws.lambda.Function(
  "get_article_score",
  {
    architectures: ["x86_64"],
    environment: {
      variables: {
        MONGO_URL: "/lit-feed/dev/mongo",
      },
    },
    ephemeralStorage: {
      size: 512,
    },
    handler: "index.handler",
    loggingConfig: {
      logFormat: "Text",
      logGroup: "get-article-score-lambda-log-group",
    },
    memorySize: 512,
    name: "get-article-score",
    packageType: "Zip",
    role: lambdaExectutionRole.arn,
    runtime: aws.lambda.Runtime.NodeJS20dX,
    timeout: 30,
    tracingConfig: {
      mode: "PassThrough",
    },
    code: new pulumi.asset.AssetArchive({
      ".": new pulumi.asset.FileArchive("./dist/get-article-score"),
    }),
  },
  {
    protect: true,
  }
);

// add a s3 bucket to store the training data pipeline file per user with versions enable and a lifecycle that moves versions older than 3 months to glacier
const articleTrainingDataBucket = new aws.s3.BucketV2(
  "article_training_data_bucket",
  {
    bucket: "lit-feed-dev-article-training-data",
    grants: [
      {
        id: "af84821e7f22b2a9f90d6ec79dfe537c05e56f02d08875ada641428ededabfc4",
        permissions: ["FULL_CONTROL"],
        type: "CanonicalUser",
        uri: "",
      },
    ],
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionExpirations: [],
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        transitions: [
          {
            days: 90,
            storageClass: "GLACIER",
          },
          {
            days: 30,
            storageClass: "ONEZONE_IA",
          },
        ],
      },
    ],
    requestPayer: "BucketOwner",
    serverSideEncryptionConfigurations: [
      {
        rules: [
          {
            applyServerSideEncryptionByDefaults: [
              {
                kmsMasterKeyId: "",
                sseAlgorithm: "AES256",
              },
            ],
            bucketKeyEnabled: false,
          },
        ],
      },
    ],
    versionings: [
      {
        enabled: true,
        mfaDelete: false,
      },
    ],
  },
  {
    protect: true,
  }
);

const trainLikedArticlesLogGroup = new aws.cloudwatch.LogGroup(
  "train_liked_articles_lambda_log_group",
  {
    logGroupClass: "STANDARD",
    name: "/aws/lambda/train-liked-articles",
    retentionInDays: 7,
  },
  {
    protect: true,
  }
);

const trainLikedArticlesEcrRepository = new aws.ecr.Repository(
  "train_liked_articles_ecr_repository",
  {
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
    forceDelete: true,
    name: "train-liked-articles",
  },
  {
    protect: true,
  }
);

const trainLikedArticlesEcrImage = new awsx.ecr.Image(
  "train_liked_articles_ecr_image",
  {
    repositoryUrl: trainLikedArticlesEcrRepository.repositoryUrl,
    context: "./src/train-liked-articles",
    platform: "linux/amd64",
  },
  {
    protect: true,
  }
);

const trainLikedArticles = new aws.lambda.Function(
  "train_liked_articles",
  {
    environment: {
      variables: {
        MONGO_URL: "/lit-feed/dev/mongo",
      },
    },
    ephemeralStorage: {
      size: 512,
    },
    loggingConfig: {
      logFormat: "Text",
      logGroup: trainLikedArticlesLogGroup.id,
    },
    memorySize: 3008,
    name: "train-liked-articles",
    packageType: "Image",
    role: lambdaExectutionRole.arn,
    timeout: 15 * 60,
    tracingConfig: {
      mode: "PassThrough",
    },
    imageUri: trainLikedArticlesEcrImage.imageUri,
  },
  {
    protect: true,
  }
);
