const { config } = require("dotenv");
const path = require("path");
config({ path: path.join(__dirname, ".env") });
const { mongoDB } = require("./init/mongodb");
const { connectDB } = require("./init/mongodb");
const { ObjectID } = require("mongodb");

console.log(config());

const admin = require("firebase-admin");

// const { User } = require("./models/user");
// const { Leaderboard } = require("./models/leaderboard");
// const { BotCommand } = require("./models/bot-command");

const serviceAccount = require("../functions/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

var db = admin.firestore();
var auth = admin.auth();

// Database should be completely clear before this is ran in order to prevent overlapping documents
// Migrate users
async function migrateUsers() {
  await db
    .collection("users")
    .where("name", "==", "mio")
    .get()
    .then((querySnapshot) => {
      // console.log('start of foreach');
      querySnapshot.forEach(async (userDoc) => {
        let userData = userDoc.data();
        let uid = userDoc.id;
        try {
          let userAuth = await auth.getUser(uid);
          let email = userAuth.email;
          let userCreatedAt = new Date(
            userAuth.metadata.creationTime
          ).getTime();

          let mongoUser = {
            name: userData.name,
            email: email,
            addedAt: userCreatedAt,
            uid: uid,
          };

          if (userData.completedTests)
            mongoUser.completedTests = userData.completedTests;
          if (userData.discordId) mongoUser.discordId = userData.discordId;
          if (userData.startedTests)
            mongoUser.startedTests = userData.startedTests;
          if (userData.timeTyping) mongoUser.timeTyping = userData.timeTyping;

          if (userData.personalBests)
            mongoUser.personalBests = userData.personalBests;

          let tagPairs = {};

          let mongoUserTags = [];

          let tagsSnapshot = await db.collection(`users/${uid}/tags`).get();
          tagsSnapshot.forEach((tagDoc) => {
            let tagData = tagDoc.data();
            let tagId = tagDoc.id;
            console.log(tagData);
            let new_id = ObjectID();
            tagPairs[tagId] = new_id;
            let tagtopush = { _id: new_id, name: tagData.name };
            if (tagData.personalBests)
              tagtopush.personalBests = tagData.personalBests;
            mongoUserTags.push(tagtopush);
          });

          mongoUser.tags = mongoUserTags;

          await mongoDB().collection("users").updateOne(
            { uid: uid },
            {
              $set: mongoUser,
            },
            { upsert: true }
          );

          if (userData.config) {
            await mongoDB()
              .collection("configs")
              .updateOne(
                { uid: uid },
                {
                  $set: {
                    uid: uid,
                    config: userData.config,
                  },
                },
                { upsert: true }
              );
          }

          let presetsSnapshot = await db
            .collection(`users/${uid}/presets`)
            .get();
          presetsSnapshot.forEach(async (presetDoc) => {
            let presetData = presetDoc.data();
            let newpreset = {
              uid: uid,
              name: presetData.name,
            };
            if (presetData.config) newpreset.config = presetData.config;
            await mongoDB().collection("presets").insertOne(newpreset);
          });

          let resultsSnapshot = await db
            .collection(`users/${uid}/results`)
            .get();
          resultsSnapshot.forEach(async (resultDoc) => {
            let resultData = resultDoc.data();
            resultData.uid = uid;
            if (resultData.tags && resultData.tags.length > 0) {
              resultData.tags = resultData.tags.map((tag) => tagPairs[tag]);
            }
            await mongoDB().collection("results").insertOne(resultData);
          });

          console.log(`${uid} migrated`);
        } catch (err) {
          console.log(`${uid} failed`);
          console.log(err);
        }

        // console.log(userData);
        //   let newUser;
        //   try{
        //     let data = userDoc.data();
        //     data._id = userDoc.id;
        //     newUser = new User(data);
        //     newUser.uid = userDoc.id;
        //     newUser.globalStats = {
        //       started: userDoc.data().startedTests,
        //       completed: userDoc.data().completedTests,
        //       time: userDoc.data().timeTyping,
        //     };
        //     let tagIdDict = {};
        //     let tagsSnapshot = await db.collection(`users/${userDoc.id}/tags`).get();
        //     tagsSnapshot.forEach((tagDoc) => {
        //       let formattedTag = tagDoc.data();
        //       formattedTag._id = mongoose.Types.ObjectId(); //generate new objectId
        //       tagIdDict[tagDoc.id] = formattedTag._id; //save pair of ids in memory to determine what to set new id as in result tags
        //       newUser.tags.push(formattedTag);
        //       console.log(`Tag ${tagDoc.id} saved for user ${userCount}`);
        //     });
        //     let resultsSnapshot = await db.collection(`users/${userDoc.id}/results`).get();
        //     let resCount = 1;
        //     resultsSnapshot.forEach((result) => {
        //       let formattedResult = result.data();
        //       if(formattedResult.tags != undefined){
        //         formattedResult.tags.forEach((tag, index) => {
        //           if (tagIdDict[tag])
        //             formattedResult.tags[index] = tagIdDict[tag];
        //         });
        //       }
        //       newUser.results.push(formattedResult);
        //       console.log(`Result ${resCount} saved for user ${userCount}`);
        //       resCount++;
        //     });
        //     newUser.results.sort((a, b) => {
        //       return a.timestamp - b.timestamp;
        //     });
        //     let presetsSnapshot = await db.collection(`users/${userDoc.id}/presets`).get();
        //     presetsSnapshot.forEach((preset) => {
        //       newUser.presets.push(preset.data());
        //     });
        //     await newUser.save();
        //     console.log(`User ${userCount} (${newUser.uid}) saved`);
        //     userCount++;
        //   }catch(e){
        //     // throw e;
        //     console.log(`User ${userCount} (${newUser.uid}) failed: ${e.message}`);
        //     userCount++;
        //   }
      });
      // console.log('end of foreach');
    });
}
// //not tested because I can't get leaderboards to work on my fork for some reason
// db.collection("leaderboards")
//   .get()
//   .then((leaderboardsSnapshot) => {
//     leaderboardsSnapshot.forEach((lbDoc) => {
//       let newLb = new Leaderboard(lbDoc.data());
//       newLb.save();
//     });
//   });

// //migrate bot-commands
// db.collection("bot-commands")
//   .get()
//   .then((botCommandsSnapshot) => {
//     botCommandsSnapshot.forEach((bcDoc) => {
//       let newBotCommand = new BotCommand(bcDoc.data());
//       newBotCommand.save();
//     });
//   });

//migrate public stat
async function migratePublicStats() {
  db.collection("public")
    .doc("stats")
    .get()
    .then((ret) => {
      let stats = ret.data();
      mongoDB()
        .collection("public")
        .updateOne(
          { type: "stats" },
          {
            $set: {
              completedTests: stats.completedTests,
              startedTests: stats.startedTests,
              timeTyping: stats.timeTyping,
            },
          },
          { upsert: true }
        );
    });
}

async function init() {
  await connectDB();
  // await migratePublicStats();
  await migrateUsers();
  // process.exit(1);
}

init();