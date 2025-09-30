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

app.get("/", (req: Request, res: Response) => {
  res.send("Stream Feeds Backend is running");
});
// Token generation endpoint
app.post("/generate-token", async (req: Request, res: Response) => {
  const { userId }: { userId?: string } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  try {
    // --> In case user is not found in the database, create a new user first
    const newUser: User = {
      id: userId,
      role: "admin",
      custom: {
        name: "Koshiqa Admin",
        image:
          "https://play-lh.googleusercontent.com/iEgjUx-zlrGGB8zg2uY0RLvlGfAgLaENDrXawLt9SmuEZ-Ec6zdLnyh_ka8d1X-YUg",
      },
      banned: false,
      online: true,
      teams_role: {},
    };
    await client.upsertUsers([newUser]);

    // --> Then generate token for the user
    const token: string = client.generateUserToken({
      user_id: userId,
      validity_in_seconds: 600000,
    });
    console.log(`Generated --${token}-- for userId: ${userId}`);
    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/create-user", async (req: Request, res: Response) => {
  const { userId }: { userId?: string } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  try {
    const newUser: User = {
      id: userId,
      role: "user",
      custom: {
        name: "Amit Singh",
      },
      banned: false,
      online: true,
      teams_role: {},
    };
    const response = await client.upsertUsers([newUser]);
    res.json({ message: "User created successfully", response });
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
app.post("/report", async (req: Request, res: Response) => {
  const {
    activityId,
    userId,
    type,
    reason,
  }: { activityId: string; userId: string; type: string; reason: string } =
    req.body;

  try {
    const response = await client.moderation.flag({
      entity_type: type,
      entity_id: activityId,
      reason: reason,
      user_id: "<moderator user id>",
      entity_creator_id: userId,
    });
    res.json({ response });
  } catch (err: any) {
    console.error("Error flagging post:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/unfollow", async (req: Request, res: Response) => {
  const { sourceFeed, targetFeed }: { sourceFeed: string; targetFeed: string } =
    req.body;

  try {
    await client.feeds.unfollow({
      source: sourceFeed,
      target: targetFeed,
    });
    res.json({ message: "Unfollowed successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/query-follow", async (req: Request, res: Response) => {
  const { sourceFeed, targetFeed }: { sourceFeed: string; targetFeed: string } =
    req.body;

  try {
    const response = await client.feeds.queryFollows({
      filter: {
        source_feed: sourceFeed,
        target_feed: targetFeed,
      },
    });

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/delete-user", async (req: Request, res: Response) => {
  const { userId }: { userId: string } = req.body;
  try {
    // // restore
    const response = await client.queryUsers({
      payload: {
        user_id: userId,
        filter_conditions: {},
      },
    });
    // const response = await client.restoreUsers({ user_ids: [userId] });
    return res.json({ message: "User restored successfully", response });

    await client.deleteUsers({
      user_ids: [userId],
      calls: "hard",
    });
    res.json({ message: "User deleted successfully" });
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
    // const feed: StreamFeed = client.feeds.getOrCreateFeed(
    // {

    //   feed_group_id : feedGroup,feed_id: feedGroupId,
    // }
    // );

    // This will create the feed if it doesn't exist
    // either one of user_id or user is required for server side
    const feedData = await feed.getOrCreate({
      limit: 10,
      user_id: userId,
      // activity_selector_options: {
      //   type: "tvs",
      // },

      // external_ranking: {
      //   decay_exp: 1,
      // },
      followers_pagination: {
        limit: 10,
      },
      following_pagination: {
        limit: 10,
      },
    });
    res.json(feedData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//get feed group details
app.get("/feeds", async (req: Request, res: Response) => {
  try {
    const userFeed = await client.feeds.createFeedGroup({
      id: "community",
      activity_selectors: [
        {
          type: "following",
        },
      ],
      ranking: { type: "recency" },
      activity_processors: [
        {
          type: "text_interest_tags",
        },
      ],
      custom: {
        description: "My custom feed group",
      },
      notification: {
        track_read: true,
        track_seen: true,
      },
    });
    console.log("Feed data:", userFeed);
    return res.json(userFeed);
  } catch (err: any) {
    console.error("Error fetching feed group:", err);
    res.status(500).json({ error: err.message });
  }
});

//get feed group details
app.put("/feed-group", async (req: Request, res: Response) => {
  try {
    const { groupId }: { groupId: string } = req.body;
    // const response = await client.feeds.updateFeedGroup({
    const response = await client.feeds.updateFeedGroup({
      id: groupId,
      activity_selectors: [{ type: "current_feed" }],
      ranking: {
        type: "recency",
      },
      activity_processors: [{ type: "text_interest_tags" }],
      notification: {
        track_read: true,
        track_seen: true,
      },
    });

    return res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//get feed group details
app.post("/feed-group", async (req: Request, res: Response) => {
  try {
    const { groupId }: { groupId: string } = req.body;
    const response = await client.feeds.getOrCreateFeedGroup({
      id: groupId,
      activity_selectors: [{ type: "current_feed" }],
      ranking: {
        type: "recency",
      },
      activity_processors: [{ type: "text_interest_tags" }],
      notification: {
        track_read: true,
        track_seen: true,
      },
    });

    return res.json(response);
  } catch (err: any) {
    console.error("Error creating feed group:", err);
    res.status(500).json({ error: err.message });
  }
});

// create feed group
app.post("/create-feed", async (req: Request, res: Response) => {
  try {
    const { groupId }: { groupId: string } = req.body;
    const response1 = await client.feeds.createFeedGroup({
      id: groupId,
      activity_processors: [
        { type: "text_interest_tags" },
        // { type: "image_interest_tags" },
      ],
      activity_selectors: [
        { type: "popular" },
        // { type: "following" },
        { type: "interest" },
      ],
      // ranking: {
      //   type: "interest",
      //   score: "decay_linear(time) * interest_score * decay_linear(popularity)",
      // },
    });

    res.json({ message: "Feed created successfully", response1 });
  } catch (err: any) {
    console.error("Error creating feed:", err);
    res.status(500).json({ error: err.message });
  }
});

// update feed
app.put("/update-feed", async (req: Request, res: Response) => {
  try {
    const { groupId, feedId }: { groupId: string; feedId: string } = req.body;
    const response1 = await client.feeds.updateFeed({
      feed_group_id: groupId,
      feed_id: feedId,
    });

    res.json({ message: "Feed created successfully", response1 });
  } catch (err: any) {
    console.error("Error creating feed:", err);
    res.status(500).json({ error: err.message });
  }
});
// delete feed
app.delete("/delete-feed", async (req: Request, res: Response) => {
  try {
    const { groupId, feedId }: { groupId: string; feedId: string } = req.body;
    const response1 = await client.feeds.deleteFeed({
      feed_group_id: groupId,
      feed_id: feedId,
    });

    res.json({ message: "Feed deleted successfully", response1 });
  } catch (err: any) {
    console.error("Error deleting feed:", err);
    res.status(500).json({ error: err.message });
  }
});

// create feed view
app.post("/create-feed-view", async (req: Request, res: Response) => {
  try {
    const { userId }: { userId: string } = req.body;
    const response1 = await client.feeds.getOrCreateFeedView({
      id: "public_profile",
      activity_selectors: [
        { filter: { user_id: userId }, type: "current_feed" },
      ],
    });

    res.json({ message: "Feed created successfully", response1 });
  } catch (err: any) {
    console.error("Error deleting feed:", err);
    res.status(500).json({ error: err.message });
  }
});

// app.post("/pin-activity", async (req: Request, res: Response) => {
//   try {
//     const { feedGroup, feedId }: { feedGroup: string; feedId: string } = req.body;
//   const data = await   client.feeds.pinActivity({
//   feed_group_id: feedGroup,
//   feed_id: feedId,
//   activity_id: activity_id,
//   user_id: user_id,
// });
// /
//     res.json({ message: "Activity pinned successfully", response });
//   }
//   catch (err: any) {
//     console.error("Error pinning activity:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// Add members to a feed
// userId is the id of the user to be added as a member
// feed_group_id is the id of the feed group
// Example: For public community feedGroup is "community" and feedGroupId is "public"
app.post("/add-members-to-feed", async (req: Request, res: Response) => {
  try {
    const {
      userId,
      feedGroupId,
      feedId,
      createFeed,
    }: {
      userId: string;
      feedGroupId: string;
      feedId: string;
      createFeed?: boolean;
    } = req.body;

    if (createFeed === true) {
      const userFeed: StreamFeed = client.feeds.feed(feedGroupId, feedId);
      const newCreatedFeed = await userFeed.getOrCreate({
        limit: 10,
        user_id: userId,
      });
    }
    const feed = await client.feeds.updateFeedMembers({
      feed_group_id: feedGroupId,
      feed_id: feedId,
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

app.put("/update-user-role", async (req: Request, res: Response) => {
  try {
    const {
      userId,
      feedGroup,
      feedId,
      newRole,
    }: {
      userId: string;
      feedGroup: string;
      feedId: string;
      newRole: string;
    } = req.body;
    console.log("Updating role for user:", userId, "to", newRole);
    const feed = client.feeds.feed(feedGroup, feedId);
    const response = await feed.updateFeedMembers({
      operation: "upsert",
      members: [
        {
          user_id: userId,
          role: newRole,
        },
      ],
    });

    res.json({ message: "User role updated successfully", response });
  } catch (err: any) {
    console.error("Error updating user role:", err);
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

app.get("/comments", async (req: Request, res: Response) => {
  try {
    const comments = await client.feeds.getComments({
      object_type: "activity",
      object_id: "bd0686f3-47fe-4643-a619-ba535d2bac3f",
      limit: 10,
      sort: "best",
      depth: 3,
    });

    res.json(comments);
  } catch (err: any) {
    console.error("Error fetching comments:", err);
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
