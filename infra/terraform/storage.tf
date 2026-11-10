# Production object storage: S3 + CloudFront.
# Implements the spec's cost rule: raw intermediates live 7–14 days, only finals are kept.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "bucket_name" { type = string }
variable "app_origin" {
  type        = string
  description = "e.g. https://talestudio.app — allowed for CORS on video playback"
}

resource "aws_s3_bucket" "media" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "raw-7d"
    status = "Enabled"
    filter {
      and {
        prefix = "raw/"
        tags   = { retention = "7" }
      }
    }
    expiration { days = 7 }
  }

  rule {
    id     = "raw-14d"
    status = "Enabled"
    filter {
      and {
        prefix = "raw/"
        tags   = { retention = "14" }
      }
    }
    expiration { days = 14 }
  }

  # Finals are watched a lot in the first weeks, rarely after: tier them down automatically.
  rule {
    id     = "final-intelligent-tiering"
    status = "Enabled"
    filter { prefix = "final/" }
    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }
  }

  rule {
    id     = "abort-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 2 }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  cors_rule {
    # PUT: direct browser uploads of recordings through presigned URLs (private/ prefix).
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = [var.app_origin]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.bucket_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media" {
  enabled     = true
  price_class = "PriceClass_100"
  comment     = "TaleStudio finals"

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  # The bucket policy below only grants CloudFront final/* — raw/ is never reachable via the CDN.
  default_cache_behavior {
    target_origin_id       = "media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}

data "aws_iam_policy_document" "cdn_read_finals" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/final/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.cdn_read_finals.json
}

output "cdn_base_url" { value = "https://${aws_cloudfront_distribution.media.domain_name}" }
