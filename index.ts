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
      {
        name: "dynamodb-all-permissions",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["dynamodb:*"],
              Resource: "*",
            },
          ],
        }),
      },
      {
        name: "lambda-all-permissions",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["lambda:*"],
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

const lambdaImagesEcrRepository = new aws.ecr.Repository(
  "lambda_images_ecr_repository",
  {
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
    forceDelete: true,
    name: "lambda-images",
  }
);

const trainLikedArticlesEcrImage = new awsx.ecr.Image(
  "train_liked_articles_ecr_image",
  {
    repositoryUrl: lambdaImagesEcrRepository.repositoryUrl,
    context: "./src/train-liked-articles",
    platform: "linux/amd64",
  }
);

const trainLikedArticles = new aws.lambda.Function("train_liked_articles", {
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
});
const syncFeedDatabase = new aws.lambda.Function(
  "sync_feed_database",
  {
    environment: {
      variables: {
        TRAIN_LIKED_ARTICLES_LAMBDA: trainLikedArticles.arn,
      },
    },
    architectures: ["x86_64"],
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

const assignScoreToArticlesLogGroup = new aws.cloudwatch.LogGroup(
  "assign_score_to_articles_lambda_log_group",
  {
    logGroupClass: "STANDARD",
    name: "/aws/lambda/assign-score-to-articles",
    retentionInDays: 7,
  },
  {
    protect: true,
  }
);

const assignScoreToArticlesEcrImage = new awsx.ecr.Image(
  "assign_score_to_articles_ecr_image",
  {
    repositoryUrl: lambdaImagesEcrRepository.repositoryUrl,
    context: "./src/assign-score-to-articles",
    platform: "linux/amd64",
  }
);

const articleScoresTable = new aws.dynamodb.Table(
  "article_scores_table",
  {
    attributes: [
      {
        name: "userId",
        type: "S",
      },
      {
        name: "articleLink",
        type: "S",
      },
    ],
    billingMode: "PAY_PER_REQUEST",
    hashKey: "userId",
    rangeKey: "articleLink",
  },
  {
    protect: true,
  }
);

const assignScoreToArticles = new aws.lambda.Function(
  "assign_score_to_articles",
  {
    environment: {
      variables: {
        ARTICLE_SCORES_TABLE: articleScoresTable.name,
      },
    },
    ephemeralStorage: {
      size: 512,
    },
    loggingConfig: {
      logFormat: "Text",
      logGroup: assignScoreToArticlesLogGroup.id,
    },
    memorySize: 2048,
    name: "assign-score-to-articles",
    packageType: "Image",
    role: lambdaExectutionRole.arn,
    timeout: 60 * 15,
    tracingConfig: {
      mode: "PassThrough",
    },
    imageUri: assignScoreToArticlesEcrImage.imageUri,
  },
  {
    dependsOn: [articleScoresTable],
  }
);
