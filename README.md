# Hive Account Recovery Service

Hive Recovery is a service that I have set up to work uninterrupted and is completely autonomous.

The service is made a two parts

#### 1. front-end

The front-end is a static HTML page which help users to configure @hive.recovery as their recovery account.

The front-end also helps to request @hive.recovery to initiate the recovery process

#### 2. back-end

The back-end is a javascript service running on a server that, upon request will verify the identity of an account and initiate the recovery process.