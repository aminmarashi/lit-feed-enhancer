# Define the provider configuration for AWS
provider "aws" {
  region  = "eu-west-1" # Ireland region
  profile = "dev"
}

terraform {
  backend "s3" {
    bucket  = "lit-feed-dev-tf"
    key     = "state/production/terraform.tfstate"
    region  = "eu-west-1"
    profile = "dev"
    encrypt = true
  }
}

# Define the Lambda function
resource "aws_lambda_function" "process-article" {
  function_name    = "process-article"
  role             = aws_iam_role.lambda_execution_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = "./build/process-article.zip"
  source_code_hash = filebase64sha256("./build/process-article.zip")
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      MONGO_URL = "/lit-feed/dev/mongo"
    }
  }

  # Grant permission to access Parameter Store
  lifecycle {
    ignore_changes = [environment]
  }
}

resource "aws_lambda_function" "sync-feed-database" {
  function_name    = "sync-feed-database"
  role             = aws_iam_role.lambda_execution_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = "./build/sync-feed-database.zip"
  source_code_hash = filebase64sha256("./build/sync-feed-database.zip")

  environment {
    variables = {
      MONGO_URL = "/lit-feed/dev/mongo"
    }
  }

  # Grant permission to access Parameter Store
  lifecycle {
    ignore_changes = [environment]
  }

}

# Define IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution_role" {
  name = "lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      },
      Action = "sts:AssumeRole"
    }]
  })

  # Add S3 access policy
  inline_policy {
    name = "s3-access-policy-article-bucket"
    policy = jsonencode({
      Version = "2012-10-17",
      Statement = [{
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ],
        Resource = "arn:aws:s3:::lit-feed-dev-article-bucket/*"
      }]
    })
  }

  inline_policy {
    name = "s3-access-policy-feed-events-bucket"
    policy = jsonencode({
      Version = "2012-10-17",
      Statement = [{
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ],
        Resource = "arn:aws:s3:::lit-feed-dev-feed-events-bucket/*"
      }]
    })
  }
}

# Attach IAM policy to grant access to Parameter Store
resource "aws_iam_policy_attachment" "lambda_parameter_store_access" {
  name       = "lambda-parameter-store-access"
  roles      = [aws_iam_role.lambda_execution_role.name]
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
}

# Define IAM user for calling the Lambda function
resource "aws_iam_user" "lambda_run_user" {
  name = "lambda-run-user"
}

# Create access key for the IAM user
resource "aws_iam_access_key" "lambda_user_access_key" {
  user = aws_iam_user.lambda_run_user.name
}

output "access_key" {
  value = aws_iam_access_key.lambda_user_access_key.id
}

output "secret_key" {
  value     = aws_iam_access_key.lambda_user_access_key.secret
  sensitive = true
}

# Attach IAM policy to grant access to call the Lambda function
resource "aws_iam_policy_attachment" "lambda_rule_user_process_article_access" {
  name       = "lambda-run-user-process-article-access"
  users      = [aws_iam_user.lambda_run_user.name]
  policy_arn = aws_iam_policy.invoke_process_article_policy.arn
}

resource "aws_iam_policy_attachment" "lambda_rule_user_sync_feed_database_access" {
  name       = "lambda-run-user-sync-feed-database-access"
  users      = [aws_iam_user.lambda_run_user.name]
  policy_arn = aws_iam_policy.invoke_sync_feed_database_policy.arn
}

# Define IAM policy for calling the Lambda function
resource "aws_iam_policy" "invoke_process_article_policy" {
  name        = "invoke-process-article-policy"
  description = "Allows calling the process-article Lambda function"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = "lambda:InvokeFunction",
      Resource = aws_lambda_function.process-article.arn
    }]
  })
}

resource "aws_iam_policy_attachment" "lambda_user_sync_feed_database_access" {
  name       = "lambda-run-user-sync-feed-database-access"
  users      = [aws_iam_user.lambda_run_user.name]
  policy_arn = aws_iam_policy.invoke_sync_feed_database_policy.arn
}

resource "aws_iam_policy" "invoke_update_user_article_policy" {
  name        = "invoke-update-user-article-policy"
  description = "Allows calling the sync-feed-database Lambda function"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = "lambda:InvokeFunction",
      Resource = aws_lambda_function.sync-feed-database.arn
    }]
  })
}

# Define CloudWatch log group for the Lambda function
resource "aws_cloudwatch_log_group" "lambda_log_group" {
  name              = "/aws/lambda/process-article"
  retention_in_days = 7
}

# Attach IAM policy to grant access to write to CloudWatch Logs
resource "aws_iam_policy_attachment" "lambda_cloudwatch_logs_access" {
  name       = "lambda-cloudwatch-logs-access"
  roles      = [aws_iam_role.lambda_execution_role.name]
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Define S3 bucket for storing articles
resource "aws_s3_bucket" "article_bucket" {
  bucket = "lit-feed-dev-article-bucket"
  acl    = "private"

  lifecycle_rule {
    id      = "manage-storage-lifecycle"
    enabled = true

    transition {
      days          = 30
      storage_class = "ONEZONE_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}
resource "aws_s3_bucket" "feed_events_bucket" {
  bucket = "lit-feed-dev-feed-events-bucket"
  acl    = "private"

  lifecycle_rule {
    id      = "manage-storage-lifecycle"
    enabled = true

    transition {
      days          = 30
      storage_class = "ONEZONE_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}

# Define IAM policy for calling the Lambda function
resource "aws_iam_policy" "invoke_sync_feed_database_policy" {
  name        = "invoke-sync-feed-database-policy"
  description = "Allows calling the sync-feed-database Lambda function"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = "lambda:InvokeFunction",
      Resource = aws_lambda_function.sync-feed-database.arn
    }]
  })
}
