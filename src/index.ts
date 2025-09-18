import express, { Express, Request, Response } from "express";
import {
  StreamClient,
  User,
  FeedGroup,
  StreamFeed,
  AddActivityRequest,
} from "@stream-io/node-sdk";
import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  STREAM_API_KEY: string;
  STREAM_API_SECRET: string;
  STREAM_APP_ID: string;
}

const {
  STREAM_API_KEY = "API_KEY",
  STREAM_API_SECRET = "API_SECRET",
  STREAM_APP_ID = "APP_ID",
} = process.env;

const client: StreamClient = new StreamClient(
  STREAM_API_KEY,
  STREAM_API_SECRET
);

const app: Express = express();
app.use(express.json());

// Token generation endpoint
app.post("/generate-token", async (req: Request, res: Response) => {
  const { userId }: { userId?: string } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  try {
    // --> In case user is not found in the database, create a new user first
    // const newUser: User = {
    //   id: userId,
    //   role: "user",
    //   custom: {
    //     color: "red",
    //     name: "Kuldeep",
    //     image: "https://avatars.githubusercontent.com/u/25670178",
    //   },
    //   banned: false,
    //   online: true,
    //   teams_role: { admin: "false" },
    // };
    // await client.upsertUsers([newUser]);

    // --> Then generate token for the user
    const token: string = client.generateUserToken({
      user_id: userId,
      validity_in_seconds: 7600000,
    });
    console.log(`Generated --${token}-- for userId: ${userId}`);
    res.json({ token, userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/add-member", async (req: Request, res: Response) => {
  const { groupId, userId }: { groupId?: string; userId?: string } = req.body;

  try {
    const groupFeed: StreamFeed = client.feeds.feed("private", groupId || "");
    res.json({ message: "Member added successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get feed feedGroup is the feed group name like "user", "timeline", "news" etc.
// userId is the id of the user for whom you want to get the feed
// feedGroupId is the id of the feed group, it can be anything
// Example: For public community feedGroup is "community" and feedGroupId is "public"
app.post("/getFeed", async (req: Request, res: Response) => {
  const {
    feedGroup,
    userId,
    feedGroupId,
  }: { feedGroup: string; userId: string; feedGroupId: string } = req.body;
  try {
    const feed: StreamFeed = client.feeds.feed(feedGroup, feedGroupId);

    // This will create the feed if it doesn't exist
    // either one of user_id or user is required for server side
    const feedData = await feed.getOrCreate({ limit: 10, user_id: userId });
    res.json(feedData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//get feed group details
app.get("/feeds", async (req: Request, res: Response) => {
  try {
    const userFeed = await client.feeds.getOrCreateFeedGroup({
      id: "mmt",
    });
    console.log("Feed data:", userFeed);
    return res.json(userFeed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// create feed group
app.get("/create-feed", async (req: Request, res: Response) => {
  try {
    const response1 = await client.feeds.createFeedGroup({
      id: "mytimeline",
      activity_processors: [
        { type: "text_interest_tags" },
        { type: "image_interest_tags" },
      ],
      activity_selectors: [
        { type: "popular" },
        { type: "following" },
        { type: "interest" },
      ],
      ranking: {
        type: "interest",
        score: "decay_linear(time) * interest_score * decay_linear(popularity)",
      },
    });

    res.json({ message: "Feed created successfully", response1 });
  } catch (err: any) {
    console.error("Error creating feed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add members to a feed
// userId is the id of the user to be added as a member
// feed_group_id is the id of the feed group
// Example: For public community feedGroup is "community" and feedGroupId is "public"
app.post("/add-members-to-feed", async (req: Request, res: Response) => {
  try {
    const { userId }: { userId: string } = req.body;

    // First create feed if not exists
    // const userFeed: StreamFeed = client.feeds.feed("mmt", userId);
    // const activities = await userFeed.getOrCreate({
    //   limit: 10,
    //   user_id: userId,
    // });
    const feed = await client.feeds.updateFeedMembers({
      feed_group_id: "community",
      feed_id: "public",
      operation: "upsert",
      members: [
        {
          user_id: userId,
          role: "member",
          custom: {
            joined: "2024-01-01",
          },
        },
      ],
    });

    console.log("Members added response:", feed);

    res.json({ message: "Members added successfully", feed });
  } catch (err: any) {
    console.error("Error adding members:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create a feed without associating it with a specific user
// Then later on add feeds to that feed group
app.post("/create-feed-without-user", async (req: Request, res: Response) => {
  try {
    const { userId }: { userId: string } = req.body;
    // const myFeedGroup = await client.feeds.createFeedGroup({
    //   id: "community",
    //   activity_selectors: [
    //     {
    //       type: "following",
    //     },
    //     { type: "interest" },
    //     { type: "popular" },
    //   ],
    //   ranking: { type: "recency" },
    //   activity_processors: [
    //     {
    //       type: "text_interest_tags",
    //     },
    //   ],
    //   custom: {
    //     description: "Stock updates feed group",
    //   },
    // });

    const feed = client.feeds.feed("community", "public");
    const response = await feed.getOrCreate({
      data: {
        description: "Apple stock updates",
        name: "apple",
        visibility: "public",
      },
      user_id: userId,
      activity_selector_options: {
        popular: {},
        following: {},
        interest: {},
      },
    });

    res.json({ message: "Feed created successfully", response });
  } catch (err: any) {
    console.error("Error creating feed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add activity to a feed
app.post("/add-activity", async (req: Request, res: Response) => {
  try {
    const { userId }: { userId: string } = req.body;
    const activity: AddActivityRequest = {
      text: "An activity be node backend " + userId,
      type: "post",
      feeds: [`community:public`],
      user_id: userId,
    };
    const response = await client.feeds.addActivity(activity);
    res.json({ message: "Activity added successfully", response });
  } catch (err: any) {
    console.error("Error adding activity:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT: string | number = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
