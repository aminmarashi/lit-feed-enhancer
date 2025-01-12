/*
  Imported from TF state using the following commands
  $ terraform state pull > terraform.tfstate
  $ pulumi import --from terraform terraform.tfstate
*/
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const config = new pulumi.Config();
const stack = pulumi.getStack().match(/dev/) ? "dev" : "prod";

const lambdaRunUser = new aws.iam.User(
  "lambda_run_user",
  { name: "lambda-run-user" },
  {
    protect: true,
  }
);
const lambdaRunUserPolicy = new aws.iam.UserPolicy("lambda_run_user_policy", {
  name: "lambda-run-user-policy",
  user: lambdaRunUser.name,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["lambda:*"],
        Effect: "Allow",
        Resource: "*",
      },
    ],
  }),
});
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
    bucket: `lit-feed-${stack}-feed-events-bucket`,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        noncurrentVersionExpirations: [],
        transitions: [],
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
    retentionInDays: 30,
  },
  {
    protect: true,
  }
);
const articleBucket = new aws.s3.BucketV2(
  "article_bucket",
  {
    bucket: `lit-feed-${stack}-article-bucket`,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        noncurrentVersionExpirations: [],
        transitions: [],
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
      {
        name: "sqs-listening-permissions",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "sqs:sendMessage",
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
              ],
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

const processArticle = new aws.lambda.Function(
  "process_article",
  {
    environment: {
      variables: {
        ARTICLE_BUCKET: articleBucket.bucket,
      },
    },
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
    role: lambdaExectutionRole.arn,
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
    retentionInDays: 30,
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
    retentionInDays: 30,
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

// add a s3 bucket to store the training data pipeline file per user with versions enable and a lifecycle that moves versions older than 3 months to glacier
const articleTrainingDataBucket = new aws.s3.BucketV2(
  "article_training_data_bucket",
  {
    bucket: `lit-feed-${stack}-article-training-data`,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        noncurrentVersionExpirations: [],
        transitions: [],
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

const trainLikedArticlesDLQ = new aws.sqs.Queue("train_liked_articles_dlq", {
  visibilityTimeoutSeconds: 900, // 15 minutes
});

const trainLikedArticlesQueue = new aws.sqs.Queue(
  "train_liked_articles_queue",
  {
    visibilityTimeoutSeconds: 900, // 15 minutes
    redrivePolicy: pulumi.interpolate`{
      "deadLetterTargetArn": "${trainLikedArticlesDLQ.arn}",
      "maxReceiveCount": 5
    }`,
  }
);

const trainLikedArticles = new aws.lambda.Function("train_liked_articles", {
  environment: {
    variables: {
      TRAINING_DATA_BUCKET_NAME: articleTrainingDataBucket.bucket,
      SQS_QUEUE_URL: trainLikedArticlesQueue.url,
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
});

const eventSourceMappingTrainLikedArticles = new aws.lambda.EventSourceMapping(
  "event_source_mapping_train_liked_articles",
  {
    batchSize: 1,
    eventSourceArn: trainLikedArticlesQueue.arn,
    functionName: trainLikedArticles.arn,
  }
);

const updateArticleScoreLogGroup = new aws.cloudwatch.LogGroup(
  "update_article_score_lambda_log_group",
  {
    logGroupClass: "STANDARD",
    name: "/aws/lambda/update-article-score",
    retentionInDays: 30,
  },
  {
    protect: true,
  }
);

const updateArticleScoreImage = new awsx.ecr.Image(
  "update_article_score_ecr_image",
  {
    repositoryUrl: lambdaImagesEcrRepository.repositoryUrl,
    context: "./src/update-article-score",
    platform: "linux/amd64",
  }
);

const updateArticleScore = new aws.lambda.Function("update_article_score", {
  environment: {
    variables: {
      TRAINING_DATA_BUCKET_NAME: articleTrainingDataBucket.bucket,
      MONGO_URL: config.requireSecret("mongoUrl"),
      USER_FEED_DATABASE_NAME: config.require("userFeedDatabaseName"),
      USER_ARTICLES_COLLECTION: config.require("userArticlesCollection"),
    },
  },
  ephemeralStorage: {
    size: 512,
  },
  loggingConfig: {
    logFormat: "Text",
    logGroup: updateArticleScoreLogGroup.id,
  },
  memorySize: 2048,
  name: "updateArticleScore",
  packageType: "Image",
  role: lambdaExectutionRole.arn,
  timeout: 60 * 15,
  tracingConfig: {
    mode: "PassThrough",
  },
  imageUri: updateArticleScoreImage.imageUri,
});

const updateArticleScoreDLQ = new aws.sqs.Queue("update_article_score_dlq", {
  visibilityTimeoutSeconds: 900, // 15 minutes
});

const updateArticleScoreQueue = new aws.sqs.Queue(
  "update_article_score_queue",
  {
    visibilityTimeoutSeconds: 900, // 15 minutes
    redrivePolicy: pulumi.interpolate`{
      "deadLetterTargetArn": "${updateArticleScoreDLQ.arn}",
      "maxReceiveCount": 5
    }`,
  }
);

const eventSourceMappingUpdateArticle = new aws.lambda.EventSourceMapping(
  "event_source_mapping_update_article_score",
  {
    batchSize: 1,
    eventSourceArn: updateArticleScoreQueue.arn,
    functionName: updateArticleScore.arn,
  }
);

const syncFeedDatabase = new aws.lambda.Function("sync_feed_database", {
  environment: {
    variables: {
      TRAIN_LIKED_ARTICLES_QUEUE_URL: trainLikedArticlesQueue.url,
      UPDATE_ARTICLE_SCORE_QUEUE_URL: updateArticleScoreQueue.url,
      FEED_EVENT_BUCKET: feedEventsBucket.bucket,
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
  timeout: 60 * 15,
  tracingConfig: {
    mode: "PassThrough",
  },
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("./dist/sync-feed-database"),
  }),
});

const mongoDumpBucket = new aws.s3.BucketV2(
  "mongo_dump_bucket",
  {
    bucket: `lit-feed-${stack}-mongo-dump-bucket`,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadDays: 0,
        enabled: true,
        expirations: [],
        id: "manage-storage-lifecycle",
        noncurrentVersionTransitions: [],
        prefix: "",
        tags: {},
        noncurrentVersionExpirations: [
          {
            days: 1,
          },
        ],
        transitions: [
          {
            days: 30,
            storageClass: "GLACIER",
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

const mongoDumpImage = new awsx.ecr.Image("mongo_dump_ecr_image", {
  repositoryUrl: lambdaImagesEcrRepository.repositoryUrl,
  context: "./src/mongo-dump",
  platform: "linux/amd64",
});

const mongoDumpLambda = new aws.lambda.Function("mongo_dump_lambda", {
  environment: {
    variables: {
      MONGO_DUMP_BUCKET_NAME: mongoDumpBucket.bucket,
      MONGO_URL: config.requireSecret("mongoUrl"),
    },
  },
  architectures: ["x86_64"],
  ephemeralStorage: {
    size: 512,
  },
  loggingConfig: {
    logFormat: "Text",
    logGroup: "mongodump-lambda-log-group",
  },
  timeout: 60 * 15,
  memorySize: 512,
  name: "mongodump-lambda",
  packageType: "Image",
  role: lambdaExectutionRole.arn,
  tracingConfig: {
    mode: "PassThrough",
  },
  imageUri: mongoDumpImage.imageUri,
});

// Run mongodump lambda every night at 12 oclock
const eventRule = new aws.cloudwatch.EventRule("mongo_dump_event_rule", {
  scheduleExpression: "cron(0 12 * * ? *)",
  description: "Fires every night at 12 oclock to dump the mongo database",
  isEnabled: true,
  name: `mongo-dump-event-rule-${stack}`,
});

const eventTarget = new aws.cloudwatch.EventTarget(
  "mongo_dump_event_target",
  {
    arn: mongoDumpLambda.arn,
    rule: eventRule.name,
  },
  { dependsOn: [eventRule] }
);

const lambdaPermission = new aws.lambda.Permission(
  "lambdaPermissionForEvent",
  {
    action: "lambda:InvokeFunction",
    function: mongoDumpLambda.arn,
    principal: "events.amazonaws.com",
    sourceArn: eventRule.arn,
  },
  { dependsOn: [eventRule] }
);

const athenaResultsBucket = new aws.s3.Bucket("athena-results-bucket", {
  acl: "private", // Keep the bucket private as it contains query results
  lifecycleRules: [
    {
      enabled: true,
      expiration: {
        days: 90,
      },
    },
  ],
});

const primaryWorkgroup = new aws.athena.Workgroup(
  "primary",
  {
    name: "primary",
    state: "ENABLED",
    configuration: {
      enforceWorkgroupConfiguration: false,
      publishCloudwatchMetricsEnabled: false,
      requesterPaysEnabled: false,
      resultConfiguration: {
        outputLocation: pulumi.interpolate`s3://${athenaResultsBucket.bucket}/query-results/`,
      },
      engineVersion: {
        selectedEngineVersion: "AUTO",
      },
    },
  },
  {
    import: "primary", // Import the existing "primary" workgroup
  }
);

const athenaFeedDatabase = new aws.athena.Database("feed", {
  name: "feed",
  bucket: athenaResultsBucket.bucket,
});

// Define the `backend_articles` table
const backendArticlesTable = new aws.glue.CatalogTable("backend_articles", {
  name: "backend_articles",
  databaseName: athenaFeedDatabase.name,
  tableType: "EXTERNAL_TABLE",
  storageDescriptor: {
    columns: [
      { name: "link", type: "string", comment: "from deserializer" },
      { name: "content", type: "string", comment: "from deserializer" },
      { name: "textcontent", type: "string", comment: "from deserializer" },
      { name: "createdat", type: "date", comment: "from deserializer" },
      { name: "updatedat", type: "date", comment: "from deserializer" },
      { name: "pubdate", type: "date", comment: "from deserializer" },
      { name: "tags", type: "array<string>", comment: "from deserializer" },
      { name: "summary", type: "string", comment: "from deserializer" },
      { name: "feedurl", type: "string", comment: "from deserializer" },
      { name: "title", type: "string", comment: "from deserializer" },
    ],
    location: pulumi.concat("s3://", articleBucket.bucket, "/backend-articles"),
    inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
    outputFormat: "org.apache.hadoop.hive.ql.io.IgnoreKeyTextOutputFormat",
    serDeInfo: {
      name: "JsonSerDe",
      serializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
      parameters: {
        "serialization.format": "1",
      },
    },
  },
  parameters: {
    transient_lastDdlTime: "1715108888",
  },
});

// Define the `user_articles` table
const userArticlesTable = new aws.glue.CatalogTable("user_articles", {
  name: "user_articles",
  databaseName: athenaFeedDatabase.name,
  tableType: "EXTERNAL_TABLE",
  storageDescriptor: {
    columns: [
      { name: "href", type: "string", comment: "from deserializer" },
      { name: "feedurl", type: "string", comment: "from deserializer" },
      { name: "userid", type: "string", comment: "from deserializer" },
      { name: "content", type: "string", comment: "from deserializer" },
      { name: "createdat", type: "date", comment: "from deserializer" },
      { name: "updatedat", type: "date", comment: "from deserializer" },
      { name: "date", type: "date", comment: "from deserializer" },
      { name: "isliked", type: "boolean", comment: "from deserializer" },
      { name: "isread", type: "boolean", comment: "from deserializer" },
      { name: "issaved", type: "boolean", comment: "from deserializer" },
      { name: "title", type: "string", comment: "from deserializer" },
    ],
    location: pulumi.concat("s3://", feedEventsBucket.bucket, "/articles"),
    inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
    outputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
    serDeInfo: {
      name: "JsonSerDe",
      serializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
      parameters: {
        "serialization.format": "1",
      },
    },
  },
  parameters: {
    transient_lastDdlTime: "1715108478",
  },
});
