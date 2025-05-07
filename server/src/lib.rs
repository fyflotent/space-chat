use rustrict::CensorStr;
use spacetimedb::{reducer, table, Identity, ReducerContext, Table, Timestamp};

#[table(name = user, public)]
pub struct User {
    #[primary_key]
    identity: Identity,
    name: Option<String>,
    online: bool,
}

#[table(name = pointer, public)]
pub struct Pointer {
    #[primary_key]
    owner: Identity,
    position_x: f32,
    position_y: f32,
}

#[table(name = room, public)]
pub struct Room {
    #[primary_key]
    #[auto_inc]
    id: u128,
    #[index(btree)]
    name: String,
}

#[table(name = message, public)]
pub struct Message {
    #[primary_key]
    #[auto_inc]
    id: u128,
    sender: Identity,
    sent: Timestamp,
    text: String,
    #[index(btree)]
    room: u128,
}

/// Takes a name and checks if it's acceptable as a user's name.
fn validate_name(name: String) -> Result<String, String> {
    if name.is_empty() {
        Err("Names must not be empty".to_string())
    } else {
        Ok(name)
    }
}

#[reducer]
/// Clients invoke this reducer to set their user names.
pub fn set_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    let name = validate_name(name)?;
    if let Some(user) = ctx.db.user().identity().find(ctx.sender) {
        ctx.db.user().identity().update(User {
            name: Some(name),
            ..user
        });
        log::info!("A user set their name");
        Ok(())
    } else {
        Err("Cannot set name for unknown user".to_string())
    }
}

/// Takes a message's text and checks if it's acceptable to send.
fn validate_message(text: String) -> Result<String, String> {
    if text.is_empty() {
        Err("Messages must not be empty".to_string())
    } else if text.is_inappropriate() {
        Err("Message is inappropriate".to_string())
    } else {
        Ok(text)
    }
}

#[reducer]
/// Clients invoke this reducer to send messages.
pub fn send_message(ctx: &ReducerContext, text: String, room_id: u128) -> Result<(), String> {
    if ctx.db.room().id().find(room_id).is_none() {
        log::error!("Room not found");
        return Err("Room not found".to_string());
    };
    let text = validate_message(text)?;
    log::info!("Message sent");
    ctx.db.message().insert(Message {
        id: 0,
        sender: ctx.sender,
        text,
        room: room_id,
        sent: ctx.timestamp,
    });
    Ok(())
}

fn validate_pointer(x_position: f32, y_position: f32) -> Result<(f32, f32), String> {
    if x_position < 0.0 || x_position > 100.0 || y_position < 0.0 || y_position > 100.0 {
        return Err("Position is out of bounds".to_string());
    }
    return Ok((x_position, y_position));
}

#[reducer]
pub fn set_pointer_position(
    ctx: &ReducerContext,
    x_position: f32,
    y_position: f32,
) -> Result<(), String> {
    if let Ok((x, y)) = validate_pointer(x_position, y_position) {
        match ctx.db.pointer().owner().find(ctx.sender) {
            Some(pointer) => ctx.db.pointer().owner().update(Pointer {
                position_x: x,
                position_y: y,
                ..pointer
            }),
            None => ctx.db.pointer().insert(Pointer {
                owner: ctx.sender,
                position_x: x,
                position_y: y,
            }),
        }
    } else {
        return Err("Invalid point".to_string());
    };
    Ok(())
}

#[reducer(client_connected)]
// Called when a client connects to a SpacetimeDB database server
pub fn client_connected(ctx: &ReducerContext) {
    if let Some(user) = ctx.db.user().identity().find(ctx.sender) {
        // If this is a returning user, i.e. we already have a `User` with this `Identity`,
        // set `online: true`, but leave `name` and `identity` unchanged.
        ctx.db.user().identity().update(User {
            online: true,
            ..user
        });
    } else {
        // If this is a new user, create a `User` row for the `Identity`,
        // which is online, but hasn't set a name.
        ctx.db.user().insert(User {
            name: None,
            identity: ctx.sender,
            online: true,
        });
        log::info!("Created user");
    }
}

#[reducer(client_disconnected)]
// Called when a client disconnects from SpacetimeDB database server
pub fn identity_disconnected(ctx: &ReducerContext) {
    if let Some(user) = ctx.db.user().identity().find(ctx.sender) {
        ctx.db.user().identity().update(User {
            online: false,
            ..user
        });
        ctx.db.pointer().owner().delete(ctx.sender);
    } else {
        // This branch should be unreachable,
        // as it doesn't make sense for a client to disconnect without connecting first.
        log::warn!(
            "Disconnect event for unknown user with identity {:?}",
            ctx.sender
        );
    }
}

#[reducer(init)]
pub fn init_db(ctx: &ReducerContext) {
    ["General", "Fun Links", "Book Club", "Videos"].map(|name| {
        // Insert room if not exists
        if ctx.db.room().name().filter(name).next().is_none() {
            ctx.db.room().insert(Room {
                id: 0,
                name: name.to_string(),
            });
        };
    });
}
